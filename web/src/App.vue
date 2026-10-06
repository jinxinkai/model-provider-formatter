<script setup>
/** 页面骨架：导航、标题与四个步骤卡片 */
import SourceCard from './components/SourceCard.vue';
import ProviderCard from './components/ProviderCard.vue';
import ModelsTable from './components/ModelsTable.vue';
import OutputCard from './components/OutputCard.vue';
import { result } from './store.js';
import { t, toggleLocale } from './i18n.js';
</script>

<template>
  <header class="nav">
    <div class="wrap nav-inner">
      <a class="logo" href="/">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" fill="currentColor" /></svg>
        Model Provider Formatter
      </a>
      <nav class="nav-links">
        <a href="https://opencode.ai/docs/providers/" target="_blank" rel="noreferrer">{{ t('nav.opencodeDocs') }}</a>
        <a href="https://docs.cherry-ai.com/" target="_blank" rel="noreferrer">{{ t('nav.cherryDocs') }}</a>
      </nav>
      <button class="pill" @click="toggleLocale">{{ t('nav.switch') }}</button>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <h1 v-html="t('hero.titleHtml')"></h1>
      <p class="lede">{{ t('hero.lede') }}</p>
    </section>

    <div class="grid-2">
      <SourceCard />
      <ProviderCard />
    </div>

    <template v-if="result">
      <ModelsTable />
      <OutputCard />
    </template>
  </main>

  <footer class="wrap foot">copyright © ECHO. All rights reserved.</footer>
</template>
