// Public project URL (the secret is the bearer token, entered on-device).
// HUMAN STEP: replace your-project-ref with the ref from `npx supabase link`.
// (Must stay a syntactically valid URL — angle brackets break `fetch`/`URL`
// parsing entirely, which also breaks Playwright's page.route interception
// in tests since the request never actually gets dispatched.)
export const COACH_URL = 'https://your-project-ref.supabase.co/functions/v1/ai-coach';
