import { useState, useEffect, useRef, useCallback } from 'react';
import { useAIContextStore, type AIContextAPI } from './useAIContext';
import { evaluateTriggers, resetTriggerCooldowns, type TriggeredMessage } from '../utils/aiTriggers';
import { recordVisit, addTimeSpent, recordParamExplored, checkNewMilestones, getFirstVisitGuide, type Milestone } from '../utils/learningProgress';

interface UseAIEngineOptions {
  module: string;
  subModule: string;
}

interface AIEngine {
  /** The full AI context API */
  ctx: AIContextAPI;
  /** Current triggered message to display (or null) */
  bubble: TriggeredMessage | null;
  /** Dismiss the current bubble */
  dismissBubble: () => void;
  /** Helper: update params + results and evaluate triggers in one call */
  sync: (
    params: Record<string, number | string | boolean>,
    results: Record<string, number | string>,
  ) => void;
  /** Newly achieved milestone (if any) */
  milestone: Milestone | null;
  /** Dismiss milestone */
  dismissMilestone: () => void;
  /** First-visit guidance message (null after first visit) */
  firstVisitGuide: string | null;
}

/**
 * One-stop hook for sub-modules. Handles:
 * - AIContext store creation
 * - Trigger evaluation on every sync()
 * - Learning progress (visit tracking, time tracking, param tracking)
 * - Milestone detection
 * - First-visit guidance
 */
export function useAIEngine({ module, subModule }: UseAIEngineOptions): AIEngine {
  const ctx = useAIContextStore(module, subModule);
  const [bubble, setBubble] = useState<TriggeredMessage | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [firstVisitGuide, setFirstVisitGuide] = useState<string | null>(null);
  const enterRef = useRef(Date.now());
  const prevSubRef = useRef(subModule);

  // Track visits & reset cooldowns on sub-module change
  useEffect(() => {
    if (prevSubRef.current !== subModule) {
      // Save time for previous module
      const elapsed = Math.round((Date.now() - enterRef.current) / 1000);
      addTimeSpent(prevSubRef.current, elapsed);
      resetTriggerCooldowns();
      enterRef.current = Date.now();
      prevSubRef.current = subModule;
    }
    recordVisit(subModule);

    // Check first-visit guidance
    const guide = getFirstVisitGuide(subModule);
    setFirstVisitGuide(guide);
    if (guide) {
      // Show as a bubble if no other bubble is showing
      setBubble({
        triggerId: `guide-${subModule}`,
        message: guide,
        priority: 'medium',
        timestamp: Date.now(),
      });
    }

    // Check milestones
    const newMilestones = checkNewMilestones();
    if (newMilestones.length > 0) {
      setMilestone(newMilestones[0]);
    }

    return () => {
      const elapsed = Math.round((Date.now() - enterRef.current) / 1000);
      addTimeSpent(subModule, elapsed);
    };
  }, [subModule]);

  const dismissBubble = useCallback(() => setBubble(null), []);
  const dismissMilestone = useCallback(() => setMilestone(null), []);

  const sync = useCallback(
    (
      params: Record<string, number | string | boolean>,
      results: Record<string, number | string>,
    ) => {
      ctx.setParams(params);
      ctx.setResults(results);

      // Track which params user has explored
      for (const key of Object.keys(params)) {
        recordParamExplored(subModule, key);
      }

      // Evaluate triggers
      const msg = evaluateTriggers(ctx.data);
      if (msg) {
        setBubble(msg);
      }

      // Periodically check milestones (every 10 syncs approximately)
      if (Math.random() < 0.1) {
        const newMilestones = checkNewMilestones();
        if (newMilestones.length > 0) {
          setMilestone(newMilestones[0]);
        }
      }
    },
    [ctx, subModule],
  );

  return { ctx, bubble, dismissBubble, sync, milestone, dismissMilestone, firstVisitGuide };
}
