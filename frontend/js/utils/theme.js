/**
 * Gestor global de tema (Light / Dark) idéntico a Voltio Minimalista
 */
export function initTheme() {
    const savedTheme = localStorage.getItem("voltio-theme") || "light";
    applyTheme(savedTheme);

    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
        updateButtonText(themeBtn, savedTheme);
        themeBtn.addEventListener("click", () => {
            toggleTheme();
        });
    }
}

export function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("voltio-theme", next);

    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
        updateButtonText(themeBtn, next);
    }
}

function applyTheme(theme) {
    if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        document.documentElement.removeAttribute("data-theme");
    }
}

function updateButtonText(btn, theme) {
    const isDark = theme === "dark";
    btn.setAttribute("title", isDark ? "Modo claro" : "Modo oscuro");
    btn.innerHTML = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      ${
          isDark
              ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
              : '<path d="M20.5 15.2A9 9 0 0 1 8.8 3.5 9 9 0 1 0 20.5 15.2Z"/>'
      }
    </svg>
    <span>${isDark ? "Claro" : "Oscuro"}</span>
  `;
}
