// localStorage that never throws (it can be blocked, or full).

export function getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full: the value just won't stick.
  }
}
