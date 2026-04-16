import { expect, test } from 'vitest';
import { StructureType } from '@/types';
import { createAgentSession, updateSessionFromActions } from './session';

test('remembers the last referenced load for follow-up edits', () => {
  const session = createAgentSession();
  const next = updateSessionFromActions(session, [
    { kind: 'add_load', payload: { loadId: 'load-9', targetSpan: 2 } },
  ]);

  expect(next.lastLoadId).toBe('load-9');
  expect(next.lastSpanIndex).toBe(2);
});

test('tracks structure type and result focus across actions', () => {
  const session = createAgentSession();
  const next = updateSessionFromActions(
    session,
    [
      { kind: 'create_structure', payload: { structureType: StructureType.MultiSpanBeam, numSpans: 3 } },
      { kind: 'explain_results', payload: { question: '为什么最大弯矩出现在第二跨？' } },
    ],
    '已创建三跨连续梁并解释结果',
  );

  expect(next.lastStructureType).toBe(StructureType.MultiSpanBeam);
  expect(next.lastResultFocus).toBe('moment');
  expect(next.lastSummary).toBe('已创建三跨连续梁并解释结果');
});
