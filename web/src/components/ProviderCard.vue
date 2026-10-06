<script setup>
/** 步骤 2：提供商信息、API Key 写入方式与推理变体风格 */
import { computed } from 'vue';
import { envVarFor } from '@core/adapters/opencode.js';
import { state, setProviderBase, setError } from '../store.js';
import { t } from '../i18n.js';

const p = state.provider;
const KEY_MODES = ['env', 'inline', 'none'];
const VARIANT_STYLES = ['auto', 'effort', 'off'];

/** @param {Event} e */
function onId(e) {
  p.id = e.target.value.trim();
  state.touched.id = true;
}

/** @param {Event} e */
function onName(e) {
  p.name = e.target.value;
  state.touched.name = true;
}

/** @param {Event} e */
function onBase(e) {
  try {
    setProviderBase(e.target.value);
  } catch (err) {
    setError(err);
  }
}

/** API Key 写入方式对应的提示；env 模式的变量名只含 [A-Z0-9_]，可安全用于 v-html */
const hint = computed(() => {
  if (p.apiKeyMode === 'env') return { html: t('provider.hint.envHtml', { var: envVarFor(p.id) }) };
  if (p.apiKeyMode === 'none') return { text: t('provider.hint.none') };
  return { text: t(state.apiKey ? 'provider.hint.inline' : 'provider.hint.noKey') };
});
</script>

<template>
  <section class="card" aria-labelledby="prov-title">
    <div class="card-head"><h2 id="prov-title"><span class="step">2</span>{{ t('provider.title') }}</h2></div>
    <div class="form-grid">
      <label class="field">
        <span>Provider ID</span>
        <input :value="p.id" placeholder="my-provider" @input="onId" />
      </label>
      <label class="field">
        <span>{{ t('provider.name') }}</span>
        <input :value="p.name" placeholder="My Provider" @input="onName" />
      </label>
      <label class="field span-2">
        <span>Base URL</span>
        <input :value="p.baseURL" placeholder="https://api.example.com/v1" @change="onBase" />
      </label>
      <label class="field">
        <span>{{ t('provider.keyMode') }}</span>
        <select v-model="p.apiKeyMode">
          <option v-for="m in KEY_MODES" :key="m" :value="m">{{ t(`provider.keyMode.${m}`) }}</option>
        </select>
      </label>
      <label class="field">
        <span>{{ t('provider.variants') }}</span>
        <select v-model="state.variantStyle">
          <option v-for="s in VARIANT_STYLES" :key="s" :value="s">{{ t(`provider.variants.${s}`) }}</option>
        </select>
      </label>
    </div>
    <p v-if="hint.html" class="hint" v-html="hint.html"></p>
    <p v-else class="hint">{{ hint.text }}</p>
  </section>
</template>
