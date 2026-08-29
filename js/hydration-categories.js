// Default categories used only when the data file has none yet.
// Once loaded, the live list lives in state.data.categories and is
// editable from the Categories tab.
const DEFAULT_CATEGORIES = [
	{ key: 'Water', label: 'Water', color: '#4fc3f7' },
	{ key: 'Milk', label: 'Milk', color: '#e0e0e0' },
	{ key: 'Tea', label: 'Tea', color: '#81c784' },
	{ key: 'Juice', label: 'Juice', color: '#ffb74d' },
	{ key: 'Soda', label: 'Soda', color: '#ba68c8' },
	{ key: 'Coffee', label: 'Coffee', color: '#6f4e37' },
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
