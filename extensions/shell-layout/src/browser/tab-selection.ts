export interface TabBarLike {
  readonly titles: readonly unknown[];
  currentIndex: number;
}

export function selectTabAtIndex(tabBar: TabBarLike | undefined, index: number): boolean {
  if (!tabBar || index < 0 || index >= tabBar.titles.length) {
    return false;
  }
  tabBar.currentIndex = index;
  return true;
}
