<script setup>
/** 字段来源标记：上游 / 规则 / 默认 / 手动 */
import { computed } from 'vue';
import { t } from '../i18n.js';

const props = defineProps({
  /** 'upstream' | 'default' | 'override' | 'rule:<key>' */
  source: { type: String, default: '' },
});
const kind = computed(() => (props.source.startsWith('rule:') ? 'rule' : props.source));
</script>

<template>
  <span class="src" :class="`src-${kind}`" :title="source">{{ t(`src.${kind}`) }}</span>
</template>
