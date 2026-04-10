<script lang="ts">
  import {fade, fly} from 'svelte/transition';
  import {X, ChevronRight, ChevronDown, CheckSquare, Square, ChevronsDownUp, Download, Search} from 'lucide-svelte';
  import {t} from 'svelte-i18n';
  import {createEventDispatcher} from 'svelte';
  import type {ExportableChapter} from '$lib/pdf/chapter-export';

  export let showChapterExportModal = false;
  export let chapters: ExportableChapter[] = [];
  export let selectedChapterIds: string[] = [];
  export let exportMode: 'merge' | 'separate' = 'merge';

  const dispatch = createEventDispatcher();
  let expandedIds = new Set<string>();
  let searchQuery = '';
  let visibleChapters: ExportableChapter[] = [];
  let lastExpandInitKey = '';
  let wasOpen = false;

  $: selectedCount = selectedChapterIds.length;
  $: {
    const chapterExpandKey = chapters
      .map((chapter) => `${chapter.id}:${chapter.parentId ?? 'root'}:${chapter.hasChildren ? 1 : 0}`)
      .join('|');
    const shouldInitExpandedIds =
      (showChapterExportModal && !wasOpen) || chapterExpandKey !== lastExpandInitKey;

    if (shouldInitExpandedIds) {
      expandedIds = new Set();
      searchQuery = '';
      lastExpandInitKey = chapterExpandKey;
    }
    wasOpen = showChapterExportModal;
  }
  $: matchingIds = new Set(
    chapters
      .filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .map((c) => c.id),
  );
  $: idsToShow = new Set();
  $: {
    if (searchQuery) {
      const newIdsToShow = new Set();
      matchingIds.forEach((id) => {
        newIdsToShow.add(id);
        let current = chapters.find((c) => c.id === id);
        while (current?.parentId) {
          newIdsToShow.add(current.parentId);
          current = chapters.find((c) => c.id === current.parentId);
        }
      });
      idsToShow = newIdsToShow;
    }
  }

  $: {
    expandedIds;
    visibleChapters = chapters.filter((chapter) => {
      if (searchQuery) {
        return idsToShow.has(chapter.id);
      }
      return isChapterVisible(chapter);
    });
  }

  function toggleSelection(chapterId: string) {
    if (selectedChapterIds.includes(chapterId)) {
      selectedChapterIds = selectedChapterIds.filter((id) => id !== chapterId);
    } else {
      selectedChapterIds = [...selectedChapterIds, chapterId];
    }
  }

  function selectAll() {
    selectedChapterIds = chapters.map((chapter) => chapter.id);
  }

  function clearSelection() {
    selectedChapterIds = [];
  }

  function toggleExpanded(chapterId: string) {
    const nextExpandedIds = new Set(expandedIds);
    if (nextExpandedIds.has(chapterId)) {
      nextExpandedIds.delete(chapterId);
    } else {
      nextExpandedIds.add(chapterId);
    }
    expandedIds = nextExpandedIds;
  }

  function expandAll() {
    expandedIds = new Set(chapters.filter((chapter) => chapter.hasChildren).map((chapter) => chapter.id));
  }

  function collapseAll() {
    expandedIds = new Set();
  }

  function isChapterVisible(chapter: ExportableChapter) {
    let currentParentId = chapter.parentId;

    while (currentParentId) {
      if (!expandedIds.has(currentParentId)) {
        return false;
      }
      currentParentId = chapters.find((item) => item.id === currentParentId)?.parentId ?? null;
    }

    return true;
  }
</script>

{#if showChapterExportModal}
  <div
    class="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50 p-4"
    transition:fade={{duration: 150}}
    on:click={() => (showChapterExportModal = false)}
  >
    <div
      class="bg-white rounded-lg p-5 md:p-6 w-[90%] md:w-[80%] max-w-3xl max-h-[90vh] overflow-y-auto border-2 border-gray-300 "
      transition:fly={{y: 20, duration: 200}}
      on:click|stopPropagation
    >
      <div class="flex justify-between items-start gap-4 mb-4">
        <div>
          <h2 class="text-xl md:text-2xl font-bold">{$t('chapter_export.title')}</h2>
          <p class="text-sm text-gray-700 mt-1">{$t('chapter_export.description')}</p>
        </div>
        <button
          on:click={() => (showChapterExportModal = false)}
          class="p-1 rounded-full text-black hover:bg-gray-100 transition-colors"
          aria-label={$t('chapter_export.close')}
        >
          <X size={24} />
        </button>
      </div>

      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div class="flex flex-wrap items-center gap-y-3 gap-x-1">
          <button
            type="button"
            on:click={selectAll}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-300 text-black border-2 border-black rounded-lg shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <CheckSquare size={14} />
            {$t('chapter_export.select_all')}
          </button>
          <button
            type="button"
            on:click={clearSelection}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white text-black border-2 border-black rounded-lg shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <Square size={14} />
            {$t('chapter_export.clear_selection')}
          </button>
          <button
            type="button"
            on:click={expandAll}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-yellow-300 text-black border-2 border-black rounded-lg shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <ChevronDown size={14} />
            {$t('chapter_export.expand_all')}
          </button>
          <button
            type="button"
            on:click={collapseAll}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-orange-200 text-black border-2 border-black rounded-lg shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <ChevronsDownUp size={14} />
            {$t('chapter_export.collapse_all')}
          </button>
          <span class="text-sm text-gray-700 ml-3 mt-2">
            {$t('chapter_export.selected_count', {values: {count: selectedCount}})}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-3 max-w-56 rounded-md bg-gray-50 border border-gray-200 px-2 py-2">
          <label class="flex items-center gap-2 text-sm font-medium text-black">
            <input
              type="radio"
              bind:group={exportMode}
              value="merge"
              class="h-4 w-4 accent-black"
            />
            {$t('chapter_export.mode_merge')}
          </label>
          <label class="flex items-center gap-2 text-sm font-medium text-black">
            <input
              type="radio"
              bind:group={exportMode}
              value="separate"
              class="h-4 w-4 accent-black"
            />
            {$t('chapter_export.mode_separate')}
          </label>
        </div>
      </div>

      <div class="relative mb-4">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Search size={18} />
        </div>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder={$t('chapter_export.search_placeholder')}
          class="block w-full pl-10 pr-10 py-2.5 border-2 border-black rounded-lg focus:ring-0 focus:border-blue-500 bg-white text-sm font-medium transition-all"
        />
        {#if searchQuery}
          <button
            type="button"
            class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-black transition-colors"
            on:click={() => (searchQuery = '')}
          >
            <X size={18} />
          </button>
        {/if}
      </div>

      <div class="border-2 border-black rounded-lg overflow-hidden">
        <div class="max-h-[45vh] min-h-[200px] overflow-y-auto divide-y divide-black/10 bg-gray-50">
          {#if chapters.length === 0}
            <div class="px-4 py-6 text-sm text-gray-600">
              {$t('chapter_export.empty')}
            </div>
          {:else if visibleChapters.length === 0}
            <div class="px-4 pt-16 pb-10 text-center text-sm text-gray-500">
              <Search size={32} class="mx-auto mb-2 opacity-20" />
              {$t('chapter_export.no_results')}
            </div>
          {:else}
            {#each visibleChapters as chapter}
              <div
                class="flex items-start gap-2 px-3 py-2.5 hover:bg-white/80"
                style={`padding-left: ${12 + (chapter.level - 1) * 18}px;`}
              >
                <button
                  type="button"
                  class="mt-0.5 h-5 w-5 rounded text-gray-500 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"
                  on:click={() => chapter.hasChildren && toggleExpanded(chapter.id)}
                  aria-label={chapter.hasChildren
                    ? (expandedIds.has(chapter.id) ? $t('chapter_export.collapse') : $t('chapter_export.expand'))
                    : $t('chapter_export.no_children')}
                  disabled={!chapter.hasChildren}
                >
                  {#if chapter.hasChildren}
                    {#if expandedIds.has(chapter.id)}
                      <ChevronDown size={14} />
                    {:else}
                      <ChevronRight size={14} />
                    {/if}
                  {/if}
                </button>
                <label class="flex items-start gap-3 min-w-0 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChapterIds.includes(chapter.id)}
                    on:change={() => toggleSelection(chapter.id)}
                    class="mt-1 h-4 w-4 accent-black flex-shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="font-medium text-black truncate">
                      {chapter.title}
                    </div>
                    <div class="text-xs text-gray-600 mt-1">
                      {$t('chapter_export.page_range', {
                        values: {start: chapter.startPage, end: chapter.endPage},
                      })}
                    </div>
                  </div>
                </label>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 justify-end mt-5">
        <button
          type="button"
          on:click={() => (showChapterExportModal = false)}
          class="px-4 py-2 font-semibold bg-white text-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {$t('chapter_export.cancel')}
        </button>
        <button
          type="button"
          on:click={() => dispatch('confirm')}
          disabled={selectedCount === 0}
          class="inline-flex items-center justify-center gap-2 px-4 py-2 font-bold bg-green-500 text-black border-2 border-black rounded-lg shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:bg-gray-300 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
        >
          <Download size={16} />
          {$t('chapter_export.export')}
        </button>
      </div>
    </div>
  </div>
{/if}
