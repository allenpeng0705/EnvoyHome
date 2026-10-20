/** Short refusal after a schedule offer. */
export function isScheduleDenial(text: string): boolean {
  const t = text
    .trim()
    .replace(/[。.!！?\s]+$/g, "")
    .replace(/^[，,、\s]+/g, "");
  if (!t || t.length > 16) return false;
  return /^(取消|不要|算了|不用了|no|nope|cancel|stop|nein|non|やめて|아니)$/i.test(t);
}

/** Short consent after a schedule offer. Longer messages stay with the model. */
export function isScheduleAffirmation(text: string): boolean {
  const t = text
    .trim()
    .replace(/[。.!！?\s]+$/g, "")
    .replace(/^[，,、\s]+/g, "");
  if (!t || t.length > 16) return false;
  return /^(请设置|设置吧|就设置|设置|确认|好的|好|是的|可以|行|yes|yeah|ok|okay|confirm|set it|do it|ja|oui|sì|si|はい|네|응)$/i.test(
    t,
  );
}
