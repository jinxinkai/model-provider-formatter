<script setup>
/** 字段来源标记：官方文档 / 上游 / 规则 / 默认 / 手动；官方文档来源链接到对应文档 */
import { computed } from 'vue';
import { RULES } from '@core/knowledge.js';
import { t } from '../i18n.js';

const props = defineProps({
  /** 'doc:<key>' | 'upstream' | 'rule:<key>' | 'default' | 'override' */
  source: { type: String, default: '' },
});
const kind = computed(() => props.source.split(':')[0]);
const doc = computed(() => kind.value === 'doc' && RULES.find((r) => `doc:${r.key}` === props.source)?.doc);
</script>

<template>
  <a v-if="doc" class="src src-doc" :href="doc" target="_blank" rel="noreferrer" :title="doc">{{ t('src.doc') }}</a>
  <span v-else class="src" :class="`src-${kind}`" :title="source">{{ t(`src.${kind}`) }}</span>
</template>
