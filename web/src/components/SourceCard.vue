<script setup>
/** 步骤 1：上游输入（API 拉取 / 粘贴 / 上传文件）与状态栏 */
import { ref } from 'vue';
import { state, fetchFromApi, loadText, IS_STATIC } from '../store.js';
import { t } from '../i18n.js';

const TABS = ['api', 'paste', 'file'];
const tab = ref('api');
const pasted = ref('');
const dragOver = ref(false);

/**
 * 读取文件内容并解析。
 * @param {File | undefined} file
 */
const readFile = (file) => file && file.text().then(loadText);

/** @param {DragEvent} e */
function onDrop(e) {
  dragOver.value = false;
  readFile(e.dataTransfer.files[0]);
}
</script>

<template>
  <section class="card" aria-labelledby="src-title">
    <div class="card-head">
      <h2 id="src-title"><span class="step">1</span>{{ t('source.title') }}</h2>
      <div class="pills" role="tablist">
        <button v-for="key in TABS" :key="key" role="tab" class="pill" :class="{ active: tab === key }" :aria-selected="tab === key" @click="tab = key">
          {{ t(`source.tab.${key}`) }}
        </button>
      </div>
    </div>

    <form v-if="tab === 'api'" autocomplete="off" @submit.prevent="fetchFromApi">
      <label class="field">
        <span>{{ t('source.url') }}</span>
        <input v-model.trim="state.apiUrl" type="url" placeholder="https://api.example.com/v1" required />
      </label>
      <label class="field">
        <span>API Key</span>
        <input v-model.trim="state.apiKey" type="password" placeholder="sk-…" />
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit" :disabled="state.loading">{{ t('source.fetch') }}</button>
        <span class="hint" v-html="t(IS_STATIC ? 'source.fetchHintStaticHtml' : 'source.fetchHintHtml')"></span>
      </div>
    </form>

    <form v-else-if="tab === 'paste'" @submit.prevent="loadText(pasted)">
      <label class="field">
        <span>{{ t('source.pasteLabel') }}</span>
        <textarea v-model="pasted" rows="8" spellcheck="false" placeholder='{"object":"list","data":[{"id":"deepseek-v4-pro","object":"model"}]}'></textarea>
      </label>
      <div class="row">
        <button class="btn btn-primary" type="submit">{{ t('source.parse') }}</button>
      </div>
    </form>

    <label v-else class="drop" :class="{ over: dragOver }" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <input type="file" accept=".json,.yaml,.yml,application/json,text/yaml" @change="readFile($event.target.files[0])" />
      <strong>{{ t('source.drop') }}</strong>
      <span>.json / .yaml / .yml</span>
    </label>

    <p class="status" :class="state.status.kind" role="status">
      {{ state.status.key ? t(state.status.key, state.status.params) : state.status.text }}
    </p>
  </section>
</template>
