<script setup>
/** 模型表格的一行：展示补全结果，并把编辑写回为手动覆盖 */
import { state, setOverride } from '../store.js';
import { t } from '../i18n.js';
import SourceBadge from './SourceBadge.vue';

const props = defineProps({
  /** @type {import('vue').PropType<import('@core/enrich.js').NormalizedModel>} */
  model: { type: Object, required: true },
});

const LIMITS = ['context', 'output'];
const CAPS = ['vision', 'toolCall'];
const REASONING = ['none', 'always', 'hybrid'];

/** @param {Partial<import('@core/enrich.js').Override>} patch */
const update = (patch) => setOverride(props.model.id, patch);

/**
 * 写入数值覆盖；空值或非正数恢复为推断结果。
 * @param {'context'|'output'} field
 * @param {string} raw
 */
function setLimit(field, raw) {
  const v = parseInt(raw, 10);
  update({ [field]: v > 0 ? v : undefined });
}

/** @param {string} field */
const isOverridden = (field) => state.overrides[props.model.id]?.[field] !== undefined;
</script>

<template>
  <tr :class="{ off: model.disabled }">
    <td class="c-on">
      <input type="checkbox" :checked="!model.disabled" :aria-label="t('row.enable', { id: model.id })" @change="update({ disabled: !$event.target.checked })" />
    </td>
    <td>
      <span class="mid">{{ model.id }}</span>
      <span v-if="model.type !== 'chat'" class="tag">{{ t(`type.${model.type}`) }}</span>
      <span v-if="model.coder" class="tag">Code</span>
      <input class="mname" :value="model.name" :aria-label="t('provider.name')" @change="update({ name: $event.target.value.trim() || undefined })" />
      <span v-if="model.notes.length" class="mnote">{{ model.notes.map((n) => t(n.key, n.params)).join(' / ') }}</span>
    </td>
    <td v-for="field in LIMITS" :key="field" class="num">
      <input class="numin" type="number" min="0" step="1024" :value="model.limits[field]" :aria-label="t(`col.${field}`)" @change="setLimit(field, $event.target.value)" />
      <SourceBadge :source="model.sources[field]" />
    </td>
    <td>
      <div class="chips">
        <button
          v-for="field in CAPS"
          :key="field"
          class="chip"
          :class="{ on: model[field], override: isOverridden(field) }"
          :aria-pressed="model[field]"
          :title="model.sources[field]"
          @click="update({ [field]: !model[field] })"
        >{{ t(`cap.${field}`) }}</button>
      </div>
    </td>
    <td>
      <select class="rsel" :value="model.reasoning" :aria-label="t('col.reasoning')" @change="update({ reasoning: $event.target.value })">
        <option v-for="r in REASONING" :key="r" :value="r">{{ t(`reasoning.${r}`) }}</option>
      </select>
      <SourceBadge :source="model.sources.reasoning" />
    </td>
    <td class="variants">{{ Object.keys(model.variants).join(' · ') || '—' }}</td>
  </tr>
</template>
