# Fact Cards

**Fact Cards** is a swipeable web app that presents interesting facts from various categories such as history, science, space, nature, and technology. Each fact is displayed as a card, which can be swiped left ("Nope") or right ("Keep"), and includes features like image or icon, source link, sharing, and expandable text.

## Features

- **Swipeable Cards:** Swipe left to dismiss or right to keep a fact.
- **Multiple Categories:** Choose from History, Science, Space, Nature, and Tech.
- **Instant Loading:** Cards appear instantly using cached or seed facts, then update with live data.
- **Expandable Text:** Long facts are truncated with a "Read more" button.
- **Share Button:** Share facts via native sharing or clipboard copy.
- **Source Links:** Each fact includes a link to its source when available.
- **Responsive Design:** Works on desktop and mobile browsers.

## How It Works

- Facts are fetched from Wikipedia and other APIs (e.g., catfact.ninja for nature).
- Cards are dynamically generated with readable color schemes.
- The app uses localStorage to cache facts for faster loading.
- Only cards with overflowing text show the "Read more" button and fade effect.
- Swiping a card triggers an animation and replenishes the stack with new facts.

## Usage

1. **Select a Category:** Use the dropdown to choose a fact category.
2. **Swipe Cards:** Drag cards left or right to interact.
3. **Expand Facts:** Click "Read more" to expand truncated text.
4. **Share Facts:** Use the share button to copy or share the fact.
5. **Reshuffle:** Click the reshuffle button to reload facts for the current category.

## Development

- **Main File:** `js/app.js`
- **Entry Point:** The app initializes on page load, builds the category select, and populates the card stack.
- **Card Generation:** See the `createCard` function for card markup and logic.
- **Clamping Logic:** The `applyClamping` function ensures only overflowing text is truncated and expandable.

## Testing

Basic runtime tests are included at the end of `app.js` to check for:
- Unique card IDs
- Card order
- Select population
- Icon fallback
- Share button presence
- Instant paint
- Fan effect
- Clamping/fade on long facts

## Requirements

- Modern browser (Chrome, Firefox, Edge, Safari)
- Internet connection (for live facts)

## License

This project is for personal and educational use. External APIs and icons are subject to their own