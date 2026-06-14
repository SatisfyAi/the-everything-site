// Default categories used only when data.json has none yet.
// Once loaded, the live list lives in state.data.categories and is
// editable from the Categories tab.
const DEFAULT_CATEGORIES = [
  { key: 'Notion', label: 'Notion and Tracking', color: '#f0c808' },
  { key: 'Recruitment', label: 'Recruitment and Onboarding', color: '#ff5e8a' },
  { key: 'Admin', label: 'Admin and Communication', color: '#7b6cff' },
  { key: 'Staff', label: 'Staff Management', color: '#ff9f1c' },
  { key: 'Reporting', label: 'Reporting', color: '#3b82f6' },
  { key: 'Misc', label: 'Miscellaneous', color: '#9aa0a6' },
];

// Generates a short, stable-ish unique key for a new category from its label.
function categoryKeyFromLabel(label, existingKeys) {
  let base =
    label
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '')
      .slice(0, 16) || 'Category';
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = base + i;
    i++;
  }
  return key;
}
