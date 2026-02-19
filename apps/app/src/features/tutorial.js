/**
 * Tutorial Feature Module
 * Lazy-loaded when user opens the tutorial
 */

// Tutorial state
let isTutorialOpen = false;
let tutorialScrollEnabled = false;
let isTutorialSubmenuOpen = false;
let currentTutorialGlossaryIndex = 0;

// State setters from main.js (called on init)
let setShowSettingsSubmenu = null;
let setIsMenuOpen = null;
let setIsSettingsSubmenuOpen = null;

/**
 * Initialize the tutorial module with callbacks
 * @param {Object} options - Configuration options
 * @param {Function} options.showSettingsSubmenu - Callback to show settings submenu
 * @param {Function} options.setIsMenuOpen - Callback to set isMenuOpen state
 * @param {Function} options.setIsSettingsSubmenuOpen - Callback to set isSettingsSubmenuOpen state
 */
export function initTutorial(options = {}) {
  setShowSettingsSubmenu = options.showSettingsSubmenu;
  setIsMenuOpen = options.setIsMenuOpen;
  setIsSettingsSubmenuOpen = options.setIsSettingsSubmenuOpen;
}

/**
 * Open the tutorial submenu
 */
export function openTutorial() {
  document.getElementById('settings-submenu').style.display = 'none';
  document.getElementById('tutorial-submenu').style.display = 'flex';

  // Update main.js state via callbacks
  if (setIsMenuOpen) setIsMenuOpen(false);
  isTutorialOpen = true;
  tutorialScrollEnabled = true;
  isTutorialSubmenuOpen = true;
  currentTutorialGlossaryIndex = 0;
  if (setIsSettingsSubmenuOpen) setIsSettingsSubmenuOpen(false);
  
  // Show glossary by default
  showTutorialGlossary();
}

/**
 * Close the tutorial submenu
 */
export function closeTutorial() {
  document.getElementById('tutorial-submenu').style.display = 'none';
  isTutorialOpen = false;
  tutorialScrollEnabled = true;
  isTutorialSubmenuOpen = false;
  
  // Return to settings submenu via callback
  if (setShowSettingsSubmenu) {
    setShowSettingsSubmenu();
  }
}

/**
 * Show a specific tutorial section
 * @param {string} sectionId - The section ID to show (without 'section-' prefix)
 */
export function showTutorialSection(sectionId) {
  const glossary = document.getElementById('tutorial-glossary');
  const contentArea = document.getElementById('tutorial-content-area');
  const targetSection = document.getElementById('section-' + sectionId);
  const backToGlossaryBtn = document.getElementById('back-to-glossary');
  
  if (glossary && contentArea && targetSection) {
    glossary.style.display = 'none';
    contentArea.style.display = 'flex';
    
    // Show back to menu button
    if (backToGlossaryBtn) {
      backToGlossaryBtn.style.display = 'block';
    }
    
    tutorialScrollEnabled = true; // Enable scrolling when viewing content
    
    // Scroll to the target section
    setTimeout(() => {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

/**
 * Show the tutorial glossary (index of sections)
 * Exported for use by main.js back button
 */
export function showGlossary() {
  showTutorialGlossary();
}

/**
 * Show the tutorial glossary (index of sections)
 */
function showTutorialGlossary() {
  const glossary = document.getElementById('tutorial-glossary');
  const contentArea = document.getElementById('tutorial-content-area');
  const backToGlossaryBtn = document.getElementById('back-to-glossary');
  
  if (glossary && contentArea) {
    contentArea.style.display = 'none';
    glossary.style.display = 'block';
    
    // Hide back to menu button when on glossary
    if (backToGlossaryBtn) {
      backToGlossaryBtn.style.display = 'none';
    }
    
    tutorialScrollEnabled = true;
    currentTutorialGlossaryIndex = 0;
    
    // Update selection after render
    setTimeout(() => {
      updateTutorialGlossarySelection();
    }, 50);
  }
}

/**
 * Scroll tutorial content up
 */
export function scrollTutorialUp() {
  if (!isTutorialSubmenuOpen) return;
  
  // Check if glossary is visible
  const glossary = document.getElementById('tutorial-glossary');
  if (glossary && glossary.style.display !== 'none') {
    const items = glossary.querySelectorAll('.glossary-item');
    if (items.length === 0) return;
    
    currentTutorialGlossaryIndex = (currentTutorialGlossaryIndex - 1 + items.length) % items.length;
    updateTutorialGlossarySelection();
    return;
  }
  
  // Otherwise scroll tutorial content
  const contentArea = document.getElementById('tutorial-content-area');
  if (!contentArea || contentArea.style.display !== 'flex') return;
  
  const tutorialContent = contentArea.querySelector('.submenu-list.tutorial-content');
  if (tutorialContent) {
    tutorialContent.scrollTop = Math.max(0, tutorialContent.scrollTop - 80);
  }
}

/**
 * Scroll tutorial content down
 */
export function scrollTutorialDown() {
  if (!isTutorialSubmenuOpen) return;
  
  // Check if glossary is visible
  const glossary = document.getElementById('tutorial-glossary');
  if (glossary && glossary.style.display !== 'none') {
    const items = glossary.querySelectorAll('.glossary-item');
    if (items.length === 0) return;
    
    currentTutorialGlossaryIndex = (currentTutorialGlossaryIndex + 1) % items.length;
    updateTutorialGlossarySelection();
    return;
  }
  
  // Otherwise scroll tutorial content
  const contentArea = document.getElementById('tutorial-content-area');
  if (!contentArea || contentArea.style.display !== 'flex') return;
  
  const tutorialContent = contentArea.querySelector('.submenu-list.tutorial-content');
  if (tutorialContent) {
    tutorialContent.scrollTop = Math.min(tutorialContent.scrollHeight - tutorialContent.clientHeight, tutorialContent.scrollTop + 80);
  }
}

/**
 * Update the visual selection in the glossary
 */
function updateTutorialGlossarySelection() {
  const glossary = document.getElementById('tutorial-glossary');
  if (!glossary) return;

  const items = glossary.querySelectorAll('.glossary-item');
  if (items.length === 0) return;

  // Remove previous selection
  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  // Add selection to current item
  if (currentTutorialGlossaryIndex >= 0 && currentTutorialGlossaryIndex < items.length) {
    const currentItem = items[currentTutorialGlossaryIndex];
    currentItem.classList.add('menu-selected');
    
    // Scroll item into view
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Select the current glossary item (navigate to its section)
 */
export function selectCurrentTutorialItem() {
  if (!isTutorialSubmenuOpen) return;
  
  const glossary = document.getElementById('tutorial-glossary');
  if (!glossary || glossary.style.display === 'none') return;
  
  const items = glossary.querySelectorAll('.glossary-item');
  if (items.length === 0 || currentTutorialGlossaryIndex >= items.length) return;
  
  const currentItem = items[currentTutorialGlossaryIndex];
  const sectionId = currentItem.getAttribute('data-section');
  
  if (sectionId) {
    showTutorialSection(sectionId);
  }
}

/**
 * Handle keyboard/menu navigation for tutorial
 */
export function handleTutorialNavigation(key) {
  switch(key) {
    case 'up':
      scrollTutorialUp();
      break;
    case 'down':
      scrollTutorialDown();
      break;
    case 'select':
      selectCurrentTutorialItem();
      break;
    case 'back':
      closeTutorial();
      break;
  }
}

// Export state getters for integration
export function isTutorialOpenState() { return isTutorialOpen; }
export function isTutorialSubmenuOpenState() { return isTutorialSubmenuOpen; }

// Default export
export default {
  initTutorial,
  openTutorial,
  closeTutorial,
  showTutorialSection,
  showGlossary,
  scrollTutorialUp,
  scrollTutorialDown,
  selectCurrentTutorialItem,
  handleTutorialNavigation,
  isTutorialOpenState,
  isTutorialSubmenuOpenState
};