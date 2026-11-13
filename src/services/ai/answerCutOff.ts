/**
 * An answer the AI stopped at the answer limit before it was complete.
 * Every provider asks again once with more room; one cut off again fails
 * the file with the same message, whatever the provider.
 */
import { AIAnalysisError, type AIProviderType } from './types';

/** The code of the error for an answer still cut off when asked again with more room */
export const ANSWER_CUT_OFF = 'answer_cut_off';

/** How many times the usual answer limit a cut-off answer is asked again with */
export const LONGER_ANSWER = 4;

const SPLIT_ADVICE = 'Split the report into smaller files and import them one by one.';

/**
 * The answer limit to ask again with: LONGER_ANSWER times the one cut off,
 * never above the most the model can write; undefined when that leaves no
 * more room
 */
export function longerAnswerLimit(limit: number, modelCap: number = Infinity): number | undefined {
  const longer = Math.min(limit * LONGER_ANSWER, modelCap);
  return longer > limit ? longer : undefined;
}

/**
 * The error for an answer cut off at `limit` tokens: the limit HemoIO set,
 * or the most the model can write (`modelCap`). `detail` says what else
 * happened, such as asking again with more room failing.
 */
export function answerCutOffError(
  provider: AIProviderType,
  limit: number,
  modelCap: number = Infinity,
  detail?: string
): AIAnalysisError {
  const whose = limit >= modelCap ? "the model's" : "HemoIO's";
  return new AIAnalysisError(
    `The AI's answer was cut off at ${whose} limit of ${limit} tokens before all values were read.` +
      `${detail ? ` ${detail}` : ''} ${SPLIT_ADVICE}`,
    provider,
    ANSWER_CUT_OFF
  );
}

/**
 * The answer asked for with `limit` tokens; one cut off is asked again once
 * with a longer limit, never above the model's cap (looked up only then).
 * One still cut off, or with no more room to give, fails with the cut-off
 * error.
 */
export async function askWithLongerRetry<R>(
  provider: AIProviderType,
  limit: number,
  modelCap: () => number | Promise<number>,
  ask: (limit: number) => Promise<R>,
  isCutOff: (answer: R) => boolean
): Promise<R> {
  const answer = await ask(limit);
  if (!isCutOff(answer)) return answer;

  const cap = await modelCap();
  const longer = longerAnswerLimit(limit, cap);
  if (longer === undefined) throw answerCutOffError(provider, limit, cap);
  const again = await ask(longer);
  if (isCutOff(again)) throw answerCutOffError(provider, longer, cap);
  return again;
}
