<script setup>
/** 步骤 4：选择目标客户端，预览、复制、下载配置或唤起 Cherry Studio */
import { ref, computed } from 'vue';
import { TARGETS } from '@core/pipeline.js';
import { state, result } from '../store.js';
import { t } from '../i18n.js';

const json = computed(() => JSON.stringify(result.value.config, null, 2));

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 先转义再着色的 JSON（键 / 字符串 / 字面量），供 v-html 使用 */
const highlighted = computed(() =>
  esc(json.value).replace(
    /(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(-?\d+(?:\.\d+)?|true|false|null)\b/g,
    (_, str, colon, lit) => (str ? `<span class="${colon ? 'k' : 's'}">${str}</span>${colon || ''}` : `<span class="n">${lit}</span>`),
  ),
);

/** 复制按钮当前显示的文案 key */
const copyKey = ref('output.copy');
async function copy() {
  try {
    await navigator.clipboard.writeText(json.value);
    copyKey.value = 'output.copied';
  } catch {
    copyKey.value = 'output.copyFailed';
  }
  setTimeout(() => (copyKey.value = 'output.copy'), 1500);
}

/** 以文件形式下载当前配置 */
function download() {
  const url = URL.createObjectURL(new Blob([json.value + '\n'], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: result.value.filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Cherry Studio 一键导入必须带 API Key */
const canOpenCherry = computed(() => Boolean(state.apiKey));
</script>

<template>
  <section class="card" aria-labelledby="out-title">
    <div class="card-head wrap-head">
      <h2 id="out-title"><span class="step">4</span>{{ t('output.title') }}</h2>
      <div class="pills">
        <button v-for="(target, key) in TARGETS" :key="key" class="pill" :class="{ active: state.target === key }" @click="state.target = key">{{ target.label }}</button>
      </div>
    </div>

    <div class="row out-actions">
      <template v-if="state.target === 'opencode'">
        <button class="btn btn-primary" @click="download">{{ t('output.downloadFile', { file: result.filename }) }}</button>
        <button class="btn btn-ghost" @click="copy">{{ t(copyKey) }}</button>
        <span class="hint" v-html="t('output.hint.opencodeHtml')"></span>
      </template>
      <template v-else>
        <a class="btn btn-primary" :class="{ disabled: !canOpenCherry }" :href="canOpenCherry ? result.deepLink : undefined" :aria-disabled="!canOpenCherry">{{ t('output.openCherry') }}</a>
        <button class="btn btn-ghost" @click="copy">{{ t(copyKey) }}</button>
        <button class="btn btn-ghost" @click="download">{{ t('output.download') }}</button>
        <span class="hint">{{ t(canOpenCherry ? 'output.hint.cherry' : 'output.hint.cherryNoKey') }}</span>
      </template>
    </div>

    <pre class="code"><code v-html="highlighted"></code></pre>
  </section>
</template>
