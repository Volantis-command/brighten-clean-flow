import { describe, expect, it } from 'vitest';
import {
  getKnowledgeScore,
  isValidAbn,
  ONBOARDING_ACKNOWLEDGEMENTS,
  ONBOARDING_KNOWLEDGE_QUESTIONS,
  PRESTART_REQUIREMENTS,
  STAFF_ONBOARDING_STEPS,
  STAFF_ONBOARDING_VERSION,
} from '@/lib/staffOnboarding';

const unique = (values: string[]) => new Set(values).size === values.length;

describe('canonical staff onboarding contract', () => {
  it('keeps every persisted checklist key unique and source-traceable', () => {
    expect(STAFF_ONBOARDING_VERSION).toBe('B-ABNB-HR-002-v1.0');
    expect(STAFF_ONBOARDING_STEPS).toHaveLength(8);
    expect(ONBOARDING_ACKNOWLEDGEMENTS).toHaveLength(14);
    expect(unique(ONBOARDING_ACKNOWLEDGEMENTS.map((item) => item.key))).toBe(true);
    ONBOARDING_ACKNOWLEDGEMENTS.forEach((item) => {
      expect(item.source).toBeTruthy();
      expect(item.declaration).toBeTruthy();
    });
  });

  it('requires and scores every knowledge question', () => {
    expect(ONBOARDING_KNOWLEDGE_QUESTIONS).toHaveLength(10);
    expect(unique(ONBOARDING_KNOWLEDGE_QUESTIONS.map((item) => item.key))).toBe(true);
    const correct = Object.fromEntries(ONBOARDING_KNOWLEDGE_QUESTIONS.map((item) => [item.key, item.correctIndex]));
    expect(getKnowledgeScore(correct)).toBe(ONBOARDING_KNOWLEDGE_QUESTIONS.length);
    expect(getKnowledgeScore({})).toBe(0);
  });

  it('has one unique pre-start gate for every applicant and admin obligation', () => {
    expect(PRESTART_REQUIREMENTS).toHaveLength(18);
    expect(unique(PRESTART_REQUIREMENTS.map((item) => item.key))).toBe(true);
    expect(PRESTART_REQUIREMENTS.some((item) => item.owner === 'cleaner')).toBe(true);
    expect(PRESTART_REQUIREMENTS.some((item) => item.owner === 'admin')).toBe(true);
    expect(PRESTART_REQUIREMENTS.map((item) => item.key)).toEqual(expect.arrayContaining([
      'id_verified',
      'brightly_app_tested',
      'shadow_clean_1_completed',
      'shadow_clean_2_completed',
      'shadow_clean_2_qc_passed',
    ]));
  });

  it('uses the Australian ABN checksum instead of accepting any 11 digits', () => {
    expect(isValidAbn('53 004 085 616')).toBe(true);
    expect(isValidAbn('11 111 111 111')).toBe(false);
  });
});
