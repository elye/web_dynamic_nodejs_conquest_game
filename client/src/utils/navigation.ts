export function parseHash(): { page: 'lobby' | 'room' | 'game'; gameId?: string } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const match = hash.match(/^(room|game)\/([A-Za-z0-9]+)$/);
  if (match) {
    return { page: match[1] as 'room' | 'game', gameId: match[2] };
  }
  return { page: 'lobby' };
}

export function navigateTo(page: 'lobby' | 'room' | 'game', gameId?: string) {
  if (page === 'lobby') {
    window.location.hash = '';
  } else {
    window.location.hash = `#${page}/${gameId}`;
  }
}
