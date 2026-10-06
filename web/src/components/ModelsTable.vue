<script setup>
/** 步骤 3：模型表格的筛选、批量操作与统计；单行编辑见 ModelRow */
import { ref, computed } from 'vue';
import { state, result, bulk } from '../store.js';
import { t } from '../i18n.js';
import ModelRow from './ModelRow.vue';
import SourceBadge from './SourceBadge.vue';

const FILTERS = {
  all: () => true,
  chat: (m) => m.type === 'chat',
  other: (m) => m.type !== 'chat',
  disabled: (m) => m.disabled,
};
const COLUMNS = ['context', 'output', 'caps', 'reasoning', 'variants'];

const query = ref('');
const filter = ref('all');

const visible = computed(() => {
  const q = query.value.toLowerCase();
  return result.value.models.filter(
    (m) => FILTERS[filter.value](m) && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
  );
});

const meta = computed(() => {
  const all = result.value.models;
  return t('models.meta', {
    source: state.source,
    total: all.length,
    enabled: all.filter((m) => !m.disabled).length,
    upstream: all.filter((m) => m.sources.context === 'upstream').length,
  });
});
</script>

<template>
  <section class="card" aria-labelledby="models-title">
    <div class="card-head wrap-head">
      <h2 id="models-title"><span class="step">3</span>{{ t('models.title') }}</h2>
      <p class="meta">{{ meta }}</p>
    </div>

    <div class="toolbar">
      <input v-model="query" type="search" :placeholder="t('models.search')" />
      <div class="pills">
        <button v-for="(_, key) in FILTERS" :key="key" class="pill" :class="{ active: filter === key }" @click="filter = key">{{ t(`filter.${key}`) }}</button>
      </div>
      <div class="row tight">
        <button v-for="mode in ['chat', 'all', 'reset']" :key="mode" class="btn btn-ghost btn-sm" @click="bulk(mode)">{{ t(`bulk.${mode}`) }}</button>
      </div>
    </div>

    <div class="table-scroll">
      <table class="models">
        <thead>
          <tr>
            <th class="c-on"><span class="sr">{{ t('col.enabled') }}</span></th>
            <th>{{ t('col.model') }}</th>
            <th v-for="c in COLUMNS" :key="c" :class="{ num: c === 'context' || c === 'output' }">{{ t(`col.${c}`) }}</th>
          </tr>
        </thead>
        <tbody>
          <ModelRow v-for="m in visible" :key="m.id" :model="m" />
          <tr v-if="!visible.length">
            <td colspan="7" class="hint empty">{{ t('models.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="legend">
      {{ t('models.legend') }}
      <SourceBadge v-for="s in ['upstream', 'rule:', 'default', 'override']" :key="s" :source="s" />
      {{ t('models.legendHint') }}
    </p>
  </section>
</template>
