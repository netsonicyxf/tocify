import fs from 'node:fs/promises';

const MARKER = '<!-- similar-issues-comment -->';
const COMMENT_TITLE = '### Similar issues found';
const COMMENT_FOOTER = '<sub>🤖 By similar-issues workflow</sub>';
const MAX_RESULTS = 3;
const MAX_PAGES = 5;
const MIN_SCORE = 0.26;
const STRONG_TITLE_SCORE = 0.42;
const STRONG_NGRAM_SCORE = 0.38;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'bug',
  'bugs',
  'by',
  'can',
  'cannot',
  'could',
  'does',
  'error',
  'errors',
  'feature',
  'features',
  'for',
  'from',
  'help',
  'how',
  'into',
  'issue',
  'issues',
  'not',
  'please',
  'problem',
  'question',
  'questions',
  'request',
  'requests',
  'should',
  'that',
  'the',
  'their',
  'there',
  'this',
  'was',
  'were',
  'when',
  'with',
  'you',
  'your',
  '一个',
  '一些',
  '不能',
  '功能',
  '功能需求',
  '咨询',
  '问题',
  '希望',
  '建议',
  '支持',
  '无法',
  '是否',
  '有个',
  '请求',
  '请问',
  '错误',
  '需求',
  '需要'
]);

const TEMPLATE_NOISE = [
  '我已完成以上自查',
  '我已经检查 api 设置和目录设置',
  '我已经搜索历史 issues',
  '请详细描述你的问题或功能需求',
  '提供足够的信息让开发者可以复现或理解问题',
  '在这里写你的描述'
];

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';

if (!token) {
  throw new Error('GITHUB_TOKEN is required');
}

if (!repository) {
  throw new Error('GITHUB_REPOSITORY is required');
}

if (!eventPath) {
  throw new Error('GITHUB_EVENT_PATH is required');
}

const [owner, repo] = repository.split('/');
const event = JSON.parse(await fs.readFile(eventPath, 'utf8'));
const currentIssue = event.issue;

if (!currentIssue || currentIssue.pull_request) {
  console.log('No issue payload found. Nothing to do.');
  process.exit(0);
}

const currentTitleText = normalizeText(currentIssue.title);
const currentTitleKeywords = extractKeywords(currentIssue.title);
const currentFullKeywords = extractKeywords(`${currentIssue.title}\n${currentIssue.body ?? ''}`);
const currentTitleNgrams = extractNgrams(currentIssue.title);
const currentFullNgrams = extractNgrams(`${currentIssue.title}\n${currentIssue.body ?? ''}`);

const issues = await fetchIssues();
const candidates = issues
  .filter((issue) => !issue.pull_request && issue.number !== currentIssue.number)
  .map(scoreIssue)
  .filter(isRelevantMatch)
  .sort((a, b) => b.score - a.score)
  .slice(0, MAX_RESULTS);

const existingComment = await findExistingComment(currentIssue.number);

if (candidates.length === 0) {
  if (existingComment) {
    await githubRequest(
      `/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
      { method: 'DELETE' }
    );
    console.log(`Deleted stale similarity comment from issue #${currentIssue.number}`);
  } else {
    console.log(`No similar issues found for #${currentIssue.number}`);
  }

  process.exit(0);
}

const body = buildCommentBody(candidates);

if (existingComment) {
  await githubRequest(`/repos/${owner}/${repo}/issues/comments/${existingComment.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body })
  });
  console.log(`Updated similarity comment for issue #${currentIssue.number}`);
} else {
  await githubRequest(`/repos/${owner}/${repo}/issues/${currentIssue.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
  console.log(`Created similarity comment for issue #${currentIssue.number}`);
}

async function fetchIssues() {
  const results = [];
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: '100',
      page: String(page),
      since
    });
    const pageItems = await githubRequest(`/repos/${owner}/${repo}/issues?${query.toString()}`);

    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    results.push(...pageItems);

    if (pageItems.length < 100) {
      break;
    }
  }

  return results;
}

async function findExistingComment(issueNumber) {
  for (let page = 1; page <= 2; page += 1) {
    const query = new URLSearchParams({
      per_page: '100',
      page: String(page)
    });
    const comments = await githubRequest(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?${query.toString()}`
    );

    if (!Array.isArray(comments) || comments.length === 0) {
      return null;
    }

    const match = comments.find((comment) => comment.body?.includes(MARKER));
    if (match) {
      return match;
    }

    if (comments.length < 100) {
      return null;
    }
  }

  return null;
}

function scoreIssue(issue) {
  const candidateTitleKeywords = extractKeywords(issue.title);
  const candidateFullKeywords = extractKeywords(`${issue.title}\n${issue.body ?? ''}`);
  const candidateTitleNgrams = extractNgrams(issue.title);
  const candidateFullNgrams = extractNgrams(`${issue.title}\n${issue.body ?? ''}`);

  const titleScore = jaccard(currentTitleKeywords, candidateTitleKeywords);
  const keywordScore = jaccard(currentFullKeywords, candidateFullKeywords);
  const ngramScore =
    (dice(currentTitleNgrams, candidateTitleNgrams) * 0.6) +
    (dice(currentFullNgrams, candidateFullNgrams) * 0.4);
  const sharedKeywords = intersectionSize(currentFullKeywords, candidateFullKeywords);

  let score =
    (titleScore * 0.5) +
    (keywordScore * 0.3) +
    (ngramScore * 0.2);

  if (currentTitleText === normalizeText(issue.title)) {
    score += 0.2;
  }

  if (sharedKeywords === 0 && titleScore < STRONG_TITLE_SCORE && ngramScore < STRONG_NGRAM_SCORE) {
    score -= 0.18;
  }

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    score: clamp(score, 0, 1),
    titleScore,
    ngramScore,
    sharedKeywords
  };
}

function isRelevantMatch(candidate) {
  if (candidate.score < MIN_SCORE) {
    return false;
  }

  if (candidate.sharedKeywords > 0) {
    return true;
  }

  return (
    candidate.titleScore >= STRONG_TITLE_SCORE ||
    candidate.ngramScore >= STRONG_NGRAM_SCORE
  );
}

function buildCommentBody(items) {
  const lines = items.map((item, index) => {
    const score = Math.round(item.score * 100);
    return `${index + 1}. [${escapeMarkdown(item.title)}](${item.url}) (#${item.number}, 相关度 ${score}%)`;
  });

  return [
    COMMENT_TITLE,
    ...lines,
    '',
    '如果这些 issue 属于同一类问题，建议优先在已有 issue 里补充信息，避免讨论分散。',
    '',
    COMMENT_FOOTER,
    '',
    MARKER
  ].join('\n');
}

function normalizeText(text) {
  let normalized = (text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/^\s*[-*]\s+\[[x ]\]\s*/gim, ' ')
    .replace(/^\s*[-*]\s+/gm, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase();

  for (const noise of TEMPLATE_NOISE) {
    normalized = normalized.replaceAll(noise, ' ');
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function extractKeywords(text) {
  const normalized = normalizeText(text);
  const tokens = new Set();

  for (const match of normalized.matchAll(/[\p{Script=Han}]{2,}|[\p{L}\p{N}]{2,}/gu)) {
    const token = match[0];

    if (/^\d+$/.test(token)) {
      continue;
    }

    if (/[\p{Script=Han}]/u.test(token)) {
      for (const gram of createSlidingWindows(token, 2)) {
        if (!STOP_WORDS.has(gram)) {
          tokens.add(gram);
        }
      }
      continue;
    }

    if (!STOP_WORDS.has(token)) {
      tokens.add(token);
    }
  }

  return tokens;
}

function extractNgrams(text) {
  const compact = normalizeText(text).replace(/\s+/g, '');
  if (!compact) {
    return new Set();
  }

  const grams = new Set();
  for (const size of [2, 3]) {
    for (const gram of createSlidingWindows(compact, size)) {
      grams.add(gram);
    }
  }

  return grams;
}

function createSlidingWindows(text, size) {
  if (text.length <= size) {
    return [text];
  }

  const windows = [];
  for (let index = 0; index <= text.length - size; index += 1) {
    windows.push(text.slice(index, index + size));
  }

  return windows;
}

function jaccard(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = intersectionSize(left, right);
  if (intersection === 0) {
    return 0;
  }

  return intersection / (left.size + right.size - intersection);
}

function dice(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const intersection = intersectionSize(left, right);
  if (intersection === 0) {
    return 0;
  }

  return (2 * intersection) / (left.size + right.size);
}

function intersectionSize(left, right) {
  let count = 0;

  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }

  return count;
}

function escapeMarkdown(text) {
  return text.replace(/[[\]()`]/g, '\\$&');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'pdf-outliner-similar-issues',
      ...options.headers
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
