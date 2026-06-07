function getSongsEntries(target) {
  // can't read: Entries._collection._docs._map
  return JSON.parse(target.dataset.text || "{}");
}
