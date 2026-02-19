import { presetStorage } from './storage.js';
import { presetImporter } from './preset-import.js';

// No need for DEFAULT_PRESETS - will load from JSON when needed
let DEFAULT_PRESETS = [];

// Camera elements
let video, canvas, capturedImage, statusElement, resetButton;
let stream = null;
let videoTrack = null;

// ===== CUSTOM ALERT & CONFIRM SYSTEM =====

// Custom styled alert to replace browser alert()
function customAlert(message, type = 'info') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const buttonsEl = document.getElementById('custom-alert-buttons');
    
    // Set message
    messageEl.textContent = message;
    
    // Set up single OK button
    buttonsEl.innerHTML = '<button class="custom-alert-btn custom-alert-btn-primary" id="custom-alert-ok">OK</button>';
    
    // Show modal
    modal.style.display = 'flex';
    
    // Handle OK button
    const okBtn = document.getElementById('custom-alert-ok');
    const handleOk = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      resolve();
    };
    okBtn.addEventListener('click', handleOk);
  });
}

// Custom styled confirm to replace browser confirm()
function customConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const buttonsEl = document.getElementById('custom-alert-buttons');
    
    // Set message
    messageEl.textContent = message;
    
    // Set up Yes/No buttons
    const yesText = options.yesText || 'Yes';
    const noText = options.noText || 'No';
    const danger = options.danger ? 'custom-alert-btn-danger' : 'custom-alert-btn-primary';
    
    buttonsEl.innerHTML = `
      <button class="custom-alert-btn custom-alert-btn-secondary" id="custom-confirm-no">${noText}</button>
      <button class="custom-alert-btn ${danger}" id="custom-confirm-yes">${yesText}</button>
    `;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Handle buttons
    const yesBtn = document.getElementById('custom-confirm-yes');
    const noBtn = document.getElementById('custom-confirm-no');
    
    const handleYes = () => {
      modal.style.display = 'none';
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
      resolve(true);
    };
    
    const handleNo = () => {
      modal.style.display = 'none';
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
      resolve(false);
    };
    
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
  });
}

// Override native alert and confirm (optional - for easier migration)
window.alert = customAlert;
window.confirm = customConfirm;

// Resolution settings
const RESOLUTION_PRESETS = [
  { name: 'VGA (640x480)', width: 640, height: 480 },
  { name: 'SVGA (800x600)', width: 800, height: 600 },
  { name: 'XGA (1024x768)', width: 1024, height: 768 },
  { name: 'SXGA (1280x960)', width: 1280, height: 960 },
  { name: 'SXGA+ (1400x1050)', width: 1400, height: 1050 },
  { name: 'UXGA (1600x1200)', width: 1600, height: 1200 },
  { name: '2K (2048x1080)', width: 2048, height: 1080 },
  { name: 'HD (3264x2448)', width: 3264, height: 2448 }
];
let currentResolutionIndex = 0; // Default to Low (640x480)
const RESOLUTION_STORAGE_KEY = 'r1_camera_resolution';

// Import resolution settings
const IMPORT_RESOLUTION_OPTIONS = [
  { name: 'VGA (640x480)', width: 640, height: 480 },
  { name: 'SVGA (800x600)', width: 800, height: 600 },
  { name: 'XGA (1024x768)', width: 1024, height: 768 },
  { name: 'SXGA (1280x960)', width: 1280, height: 960 },
  { name: 'UXGA (1600x1200)', width: 1600, height: 1200 },
  { name: '2K (2048x1080)', width: 2048, height: 1080 }
];
let currentImportResolutionIndex = 0; // Default to VGA (640x480)
const IMPORT_RESOLUTION_STORAGE_KEY = 'r1_import_resolution';

// White balance settings - COMMENTED OUT
// const WHITE_BALANCE_MODES = [
//   { name: 'Auto', value: 'auto' },
//   { name: 'Daylight', value: 'daylight' },
//   { name: 'Cloudy', value: 'cloudy' },
//   { name: 'Tungsten', value: 'tungsten' },
//   { name: 'Fluorescent', value: 'fluorescent' },
//   { name: 'Candlelight', value: 'candlelight' },
//   { name: 'Moonlight', value: 'moonlight' }
// ];
// let currentWhiteBalanceIndex = 0; // Default to Auto
// const WHITE_BALANCE_STORAGE_KEY = 'r1_camera_white_balance';

// Camera switching variables
let currentCameraIndex = 0;
let availableCameras = [];
let isLoadingCamera = false;

// Zoom variables
let currentZoom = 1;
let isPinching = false;
let initialPinchDistance = 0;
let initialZoom = 1;
let zoomThrottleTimeout = null;

// Burst mode variables
let isBurstMode = false;
let burstCount = 5;
let burstDelay = 500;
let isBursting = false;
const BURST_SPEEDS = {
  1: { delay: 800, label: 'Slow' },
  2: { delay: 500, label: 'Medium' },
  3: { delay: 300, label: 'Fast' }
};
const BURST_SETTINGS_KEY = 'r1_camera_burst_settings';
const TIMER_SETTINGS_KEY = 'r1_camera_timer_settings';
const LAST_USED_PRESET_KEY = 'r1_camera_last_preset';

// Timer variables
let isTimerMode = false;
let timerCountdown = null;
let timerDelay = 10; // 10 seconds
let timerRepeatEnabled = false;
let timerDelayOptions = [3, 5, 10]; // Slider maps to these values
let timerRepeatInterval = 1; 

// Add this constant for repeat interval options - ADD THIS
const TIMER_REPEAT_INTERVALS = {
  1: { seconds: 1, label: '1s' },
  2: { seconds: 3, label: '3s' },
  3: { seconds: 5, label: '5s' },
  4: { seconds: 10, label: '10s' },
  5: { seconds: 30, label: '30s' },
  6: { seconds: 60, label: '1m' },
  7: { seconds: 300, label: '5m' },
  8: { seconds: 600, label: '10m' },
  9: { seconds: 1800, label: '30m' },
  10: { seconds: 3600, label: '1h' }
};

// Master Prompt settings
let masterPromptText = '';
let masterPromptEnabled = false;
const MASTER_PROMPT_STORAGE_KEY = 'r1_camera_master_prompt';
const MASTER_PROMPT_ENABLED_KEY = 'r1_camera_master_prompt_enabled';
const ASPECT_RATIO_STORAGE_KEY = 'r1_camera_aspect_ratio';
let selectedAspectRatio = 'none'; // 'none', '1:1', or '16:9'

// Random seed selection tracking
const SELECTION_HISTORY_KEY = 'r1_camera_selection_history';
let selectionHistory = {}; // Format: { presetName: [selection1, selection2, ...] }
const MAX_HISTORY_PER_PRESET = 5; // Remember last 5 selections per preset

// Randomizer variables
let isRandomMode = false;

// Motion detection variables
let isMotionDetectionMode = false;
let motionDetectionInterval = null;
let lastFrameData = null;
let motionThreshold = 30; // Sensitivity: lower = more sensitive
let motionPixelThreshold = 0.1; // Percentage of pixels that need to change
let motionContinuousEnabled = true; // Continue capturing without New Photo button
let motionCooldown = 2; // Seconds to wait after capture
let isMotionCooldownActive = false;
let motionStartDelay = 3; // Seconds to wait before starting detection
const MOTION_SETTINGS_KEY = 'r1_camera_motion_settings';
let motionStartInterval = null;

// Start delay options mapping
const MOTION_START_DELAYS = {
  1: { seconds: 3, label: '3s' },
  2: { seconds: 10, label: '10s' },
  3: { seconds: 30, label: '30s' },
  4: { seconds: 60, label: '1m' },
  5: { seconds: 300, label: '5m' },
  6: { seconds: 600, label: '10m' },
  7: { seconds: 900, label: '15m' },
  8: { seconds: 1800, label: '30m' }
};

// No Magic mode
let noMagicMode = false;
const NO_MAGIC_MODE_KEY = 'r1_camera_no_magic_mode';

// Track if we entered Master Prompt from gallery
let returnToGalleryFromMasterPrompt = false;
let savedViewerImageIndex = -1;

// Style reveal elements
let styleRevealElement, styleRevealText;
let styleRevealTimeout = null;
let filterDebounceTimeout = null;

// Menu scrolling variables
let currentMenuIndex = 0;
let isMenuOpen = false;
let menuScrollEnabled = false;
// Tutorial state - managed by lazy-loaded tutorial module
let tutorialModule = null; // Cached tutorial module after first load
let isTutorialOpen = false;
let tutorialScrollEnabled = false;
let isTutorialSubmenuOpen = false;
let currentTutorialGlossaryIndex = 0;

let isPresetSelectorOpen = false;
let currentPresetIndex_Gallery = 0;
let currentSettingsIndex = 0;
let currentResolutionIndex_Menu = 0;
let currentBurstIndex = 0;
let currentTimerIndex = 0;
let currentMasterPromptIndex = 0;
let currentMotionIndex = 0;
let isSettingsSubmenuOpen = false;
let isResolutionSubmenuOpen = false;
let isBurstSubmenuOpen = false;
let isTimerSubmenuOpen = false;
let isMasterPromptSubmenuOpen = false;
let isMotionSubmenuOpen = false;
let isAspectRatioSubmenuOpen = false;
let currentAspectRatioIndex = 0;
let isImportResolutionSubmenuOpen = false;
let currentImportResolutionIndex_Menu = 0;
let isPresetBuilderSubmenuOpen = false;
let editingPresetBuilderIndex = -1;
let currentGalleryIndex = 0;
let currentViewerIndex = 0;
let currentEditorIndex = 0;
let currentQueueIndex = 0;

// Gallery variables - IndexedDB
const DB_NAME = 'R1CameraGallery';
const DB_VERSION = 1;
const STORE_NAME = 'images';
let db = null;
let galleryImages = [];
const GALLERY_SORT_ORDER_KEY = 'r1_gallery_sort_order';
let currentViewerImageIndex = -1;
let viewerZoom = 1;
let viewerIsPinching = false;
let viewerInitialPinchDistance = 0;
let viewerInitialZoom = 1;
let currentGalleryPage = 1;
const ITEMS_PER_PAGE = 16;
let galleryStartDate = null;
let galleryEndDate = null;
let gallerySortOrder = 'newest';

// Batch processing variables
let isBatchMode = false;
let selectedBatchImages = new Set();

// Multiple preset variables
let isMultiPresetMode = false;
let isBatchPresetSelectionActive = false;
let selectedPresets = [];
let multiPresetImageId = null;

// Style filter
let styleFilterText = '';
let presetFilterText = '';
let presetListScrollPosition = 0;
let visiblePresetsFilterByCategory = ''; // Track selected category filter
let mainMenuFilterByCategory = ''; // Track selected category filter for main menu
let galleryPresetFilterByCategory = ''; // Track selected category filter for gallery preset selector
let isStyleFilterFocused = false; // ADD THIS
let isVisiblePresetsFilterFocused = false; // ADD THIS
let isPresetFilterFocused = false; // ADD THISr

// QR Code detection variables
let qrDetectionInterval = null;
let lastDetectedQR = null;
let qrDetectionActive = false;
const QR_DETECTION_INTERVAL = 500; // Check every 500ms

// Preset Builder templates
const PRESET_TEMPLATES = {
  transform: "Take a picture and transform the image into [DESCRIBE TRANSFORMATION]. [ADD SPECIFIC DETAILS ABOUT STYLE, APPEARANCE, COLORS, ETC.]",
  transform_subject: "Take a picture and transform the subject into [WHAT THE SUBJECT BECOMES]. Preserve the subject's recognizable facial structure and identity. [ADD DETAILS ABOUT NEW APPEARANCE, ENVIRONMENT, LIGHTING].",
  convert: "Take a picture and convert the scene into [DESCRIBE NEW FORMAT/MEDIUM]. [ADD DETAILS ABOUT MATERIALS, TEXTURES, SCALE].",
  style: "Take a picture in the style of [ARTISTIC STYLE/ARTIST]. [ADD DETAILS ABOUT TECHNIQUE, COLORS, COMPOSITION].",
  place: "Take a picture and place the subject in [DESCRIBE SCENE/LOCATION]. [ADD DETAILS ABOUT LIGHTING, ATMOSPHERE, INTEGRATION].",
  recreate: "Take a picture and recreate [FAMOUS WORK/SCENE]. Replace [DESCRIBE WHAT TO REPLACE]. Preserve the iconic [DESCRIBE KEY ELEMENTS TO KEEP].",
  render: "Take a picture and render it as [FORMAT/MEDIUM]. [ADD DETAILS ABOUT APPEARANCE, TEXTURE, TECHNICAL SPECIFICS].",
  make: "Take a picture and make the subject into [CHARACTER/CREATURE]. [ADD DETAILS ABOUT APPEARANCE, TRAITS, SETTING]. Make it photorealistic.",
  analyze: "Analyze the image and [DESCRIBE WHAT TO ANALYZE/EXTRACT]. [ADD DETAILS ABOUT OUTPUT FORMAT] and email it to me.",
  
  // Random Selection Templates
  random_even_odd: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If the RANDOM SEED ends in an EVEN number (0,2,4,6,8): SELECT Option A
- If the RANDOM SEED ends in an ODD number (1,3,5,7,9): SELECT Option B

If Option A:
[DESCRIBE WHAT HAPPENS IN OPTION A - BE SPECIFIC ABOUT VISUAL DETAILS, STYLE, SETTING, ETC.]

If Option B:
[DESCRIBE WHAT HAPPENS IN OPTION B - BE SPECIFIC ABOUT VISUAL DETAILS, STYLE, SETTING, ETC.]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO BOTH OPTIONS - LIGHTING, QUALITY, PRESERVATION, ETC.]`,

  random_last_digit: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If none is specified, SELECT EXACTLY ONE using LAST DIGIT modulo [NUMBER 2-10]:
  - 0: [OPTION 1 DESCRIPTION]
  - 1: [OPTION 2 DESCRIPTION]
  - 2: [OPTION 3 DESCRIPTION]
  - 3: [OPTION 4 DESCRIPTION]
  - 4: [OPTION 5 DESCRIPTION]
  - 5: [OPTION 6 DESCRIPTION]
  - 6: [OPTION 7 DESCRIPTION]
  - 7: [OPTION 8 DESCRIPTION]
  - 8: [OPTION 9 DESCRIPTION]
  - 9: [OPTION 10 DESCRIPTION]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO ALL OPTIONS - STYLE, QUALITY, TECHNICAL DETAILS, ETC.]

IMPORTANT:
- Replace [NUMBER 2-10] with the actual number of options you have (between 2 and 10)
- Remove any unused option lines (e.g., if you only have 5 options, remove lines 5-9)
- Each option should be a distinct visual variation or transformation
- For exactly 10 options, use LAST DIGIT modulo 10 (covers digits 0-9)`,

  random_last_two: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If none is specified, SELECT EXACTLY ONE using LAST TWO DIGITS modulo [NUMBER 11-99]:
  - 0: [OPTION 1 DESCRIPTION]
  - 1: [OPTION 2 DESCRIPTION]
  - 2: [OPTION 3 DESCRIPTION]
  - 3: [OPTION 4 DESCRIPTION]
  - 4: [OPTION 5 DESCRIPTION]
  - 5: [OPTION 6 DESCRIPTION]
  - 6: [OPTION 7 DESCRIPTION]
  - 7: [OPTION 8 DESCRIPTION]
  - 8: [OPTION 9 DESCRIPTION]
  - 9: [OPTION 10 DESCRIPTION]
  - 10: [OPTION 11 DESCRIPTION]
  - 11: [OPTION 12 DESCRIPTION]
  - 12: [OPTION 13 DESCRIPTION]
  - 13: [OPTION 14 DESCRIPTION]
  - 14: [OPTION 15 DESCRIPTION]
  - 15: [OPTION 16 DESCRIPTION]
  - 16: [OPTION 17 DESCRIPTION]
  - 17: [OPTION 18 DESCRIPTION]
  - 18: [OPTION 19 DESCRIPTION]
  - 19: [OPTION 20 DESCRIPTION]
  - 20: [OPTION 21 DESCRIPTION]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO ALL OPTIONS]

IMPORTANT:
- Replace [NUMBER 11-99] with the actual number of options (between 11 and 99)
- Add or remove option lines to match your number of options
- Use LAST TWO DIGITS only when you have MORE than 10 options
- Ensure the colon (:) comes immediately after the modulo number
- Use exactly 2 spaces before each dash (-)
- Keep all options in one continuous list with no blank lines`,

  random_last_three: `Take a picture and transform [DESCRIBE BASE TRANSFORMATION].

SELECTION (CRITICAL):
- If an external master prompt specifies [WHAT CAN BE SPECIFIED], USE THAT
- If none is specified, SELECT EXACTLY ONE using LAST THREE DIGITS modulo [NUMBER 100+]:
  - 0: [OPTION 1 DESCRIPTION]
  - 1: [OPTION 2 DESCRIPTION]
  - 2: [OPTION 3 DESCRIPTION]
  - 3: [OPTION 4 DESCRIPTION]
  - 4: [OPTION 5 DESCRIPTION]
  (continue numbering for all your options)
  - 98: [OPTION 99 DESCRIPTION]
  - 99: [OPTION 100 DESCRIPTION]
  - 100: [OPTION 101 DESCRIPTION]

[ADD ANY ADDITIONAL INSTRUCTIONS THAT APPLY TO ALL OPTIONS]

IMPORTANT:
- Replace [NUMBER 100+] with the actual number of options (101 or more)
- Add option lines for every option you want to include
- Use LAST THREE DIGITS only when you have 101 or more options
- Ensure the colon (:) comes immediately after the modulo number
- Use exactly 2 spaces before each dash (-)
- Keep all options in one continuous list with no blank lines
- This format is ideal for large preset collections like 120 Star Trek species or 150 character types`,
  
  custom: ""
};

// Load styles from localStorage or use defaults
let CAMERA_PRESETS = [];
let factoryPresets = [];
let hasImportedPresets = false; // Track if we're using imported presets
let currentPresetIndex = 0;
let editingStyleIndex = -1;
let isOnline = navigator.onLine;
let photoQueue = [];
let isSyncing = false;

// Scroll debouncing variables
let scrollTimeout = null;
let lastScrollTime = 0;
const SCROLL_DEBOUNCE_MS = 500;
const QUEUE_STORAGE_KEY = 'r1_camera_queue';

// Connection status elements
let connectionStatusElement, queueStatusElement, syncButton;

// Local storage key (for ALL camera presets)
const STORAGE_KEY = 'r1_camera_styles';

// Local storage key (for the ARRAY of favorite style names)
let favoriteStyles = []; 
const FAVORITE_STYLES_KEY = 'r1_camera_favorites';
const VISIBLE_PRESETS_KEY = 'r1_camera_visible_presets';
let visiblePresets = []; // Array of preset names that should be shown
let isVisiblePresetsSubmenuOpen = false;
let currentVisiblePresetsIndex = 0;
let visiblePresetsFilterText = '';
let visiblePresetsScrollEnabled = true;

// Style reveal functionality
function showStyleReveal(styleName) {
  if (styleRevealTimeout) {
    clearTimeout(styleRevealTimeout);
    styleRevealTimeout = null;
  }

  if (!styleRevealElement) {
    styleRevealElement = document.getElementById('style-reveal');
    styleRevealText = document.getElementById('style-reveal-text');
  }

  if (!styleRevealElement || !styleRevealText) return;
  
  // If NO MAGIC MODE is on, always show NO MAGIC MODE in popup
  styleRevealText.textContent = noMagicMode ? '⚡ NO MAGIC MODE' : styleName;
  styleRevealElement.style.display = 'block';
  
  styleRevealTimeout = setTimeout(() => {
    if (styleRevealElement) {
      styleRevealElement.style.display = 'none';
    }
    styleRevealTimeout = null;
  }, 1200);
}

// ===================================
// Gallery Functions
// ===================================

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB opened successfully');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      db = event.target.result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Object store created');
      }
    };
  });
}

// Migrate old localStorage data to IndexedDB (run once)
async function migrateFromLocalStorage() {
  try {
    const oldIndexJson = localStorage.getItem('r1_gallery_index');
    if (!oldIndexJson) {
      console.log('No old gallery data to migrate');
      return;
    }
    
    const index = JSON.parse(oldIndexJson);
    let migratedCount = 0;
    
    for (const keyNum of index) {
      const keyName = 'r1_gallery_' + keyNum;
      const imagesJson = localStorage.getItem(keyName);
      if (imagesJson) {
        const images = JSON.parse(imagesJson);
        for (const image of images) {
          await saveImageToDB(image);
          migratedCount++;
        }
        // Clean up old localStorage key
        localStorage.removeItem(keyName);
      }
    }
    
    // Clean up old index
    localStorage.removeItem('r1_gallery_index');
    
    console.log(`Migration complete: ${migratedCount} images migrated to IndexedDB`);
    
    // Reload gallery
    await loadGallery();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

// Load gallery from IndexedDB
async function loadGallery() {
  try {
    if (!db) {
      await initDB();
    }
    
    galleryImages = [];
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        galleryImages = request.result || [];
        
        // Load saved sort order
        const savedSortOrder = localStorage.getItem(GALLERY_SORT_ORDER_KEY);
        if (savedSortOrder) {
          gallerySortOrder = savedSortOrder;
        }
        
        // Sort by timestamp descending
        galleryImages.sort((a, b) => b.timestamp - a.timestamp);
        
        console.log(`Gallery loaded: ${galleryImages.length} images`);
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to load gallery:', request.error);
        galleryImages = [];
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error loading gallery:', err);
    galleryImages = [];
  }
}

// Save single image to IndexedDB
async function saveImageToDB(imageItem) {
  try {
    if (!db) {
      await initDB();
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.add(imageItem);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('Image saved to IndexedDB');
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to save image:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error saving image:', err);
  }
}

// Delete image from IndexedDB
async function deleteImageFromDB(imageId) {
  try {
    if (!db) {
      await initDB();
    }
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(imageId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('Image deleted from IndexedDB');
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to delete image:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error deleting image:', err);
  }
}

// Get image count from IndexedDB
async function getImageCount() {
  try {
    if (!db) {
      await initDB();
    }
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.count();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('Failed to count images:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Error counting images:', err);
    return 0;
  }
}

async function addToGallery(imageBase64) {
  const galleryItem = {
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
    imageBase64: imageBase64,
    timestamp: Date.now()
  };
  
  // Add to memory array
  galleryImages.unshift(galleryItem);
  
  // Save to IndexedDB (no limit!)
  await saveImageToDB(galleryItem);
  
  console.log(`Image added. Total: ${galleryImages.length}`);
}

function filterGalleryByDate(images) {
  if (!galleryStartDate && !galleryEndDate) {
    return images;
  }
  
  return images.filter(item => {
    const itemDate = new Date(item.timestamp);
    itemDate.setHours(0, 0, 0, 0);
    const itemTime = itemDate.getTime();
    
    let matchesStart = true;
    let matchesEnd = true;
    
    if (galleryStartDate) {
      const startTime = new Date(galleryStartDate).getTime();
      matchesStart = itemTime >= startTime;
    }
    
    if (galleryEndDate) {
      const endTime = new Date(galleryEndDate).getTime();
      matchesEnd = itemTime <= endTime;
    }
    
    return matchesStart && matchesEnd;
  });
}

function sortGalleryImages(images) {
  const sorted = [...images];
  if (gallerySortOrder === 'newest') {
    sorted.sort((a, b) => b.timestamp - a.timestamp);
  } else {
    sorted.sort((a, b) => a.timestamp - b.timestamp);
  }
  return sorted;
}

function getFilteredAndSortedGallery() {
  let filtered = filterGalleryByDate(galleryImages);
  return sortGalleryImages(filtered);
}

async function showGallery() {
  pauseCamera();
  cancelTimerCountdown();

  // Clear any captured image before opening gallery
  if (capturedImage && capturedImage.style.display === 'block') {
    resetToCamera();
  }
  
  // Reload gallery from IndexedDB to ensure we have latest data
  await loadGallery();
  const modal = document.getElementById('gallery-modal');
  const grid = document.getElementById('gallery-grid');
  const pagination = document.getElementById('gallery-pagination');
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  // Update gallery count in header
  const galleryCount = document.getElementById('gallery-count');
  if (galleryCount) {
    galleryCount.textContent = galleryImages.length;
  }
  
  // Set the sort order dropdown to current value
  const sortOrderSelect = document.getElementById('gallery-sort-order');
  if (sortOrderSelect) {
    sortOrderSelect.value = gallerySortOrder;
  }
  
  const filteredImages = getFilteredAndSortedGallery();
  
  if (filteredImages.length === 0) {
    grid.innerHTML = '<div class="gallery-empty">No photos match the selected filter.</div>';
    pagination.style.display = 'none';
  } else {
    const totalPages = Math.ceil(filteredImages.length / ITEMS_PER_PAGE);
    currentGalleryPage = Math.min(currentGalleryPage, totalPages);
    
    const startIndex = (currentGalleryPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredImages.length);
    const pageImages = filteredImages.slice(startIndex, endIndex);
    
    const fragment = document.createDocumentFragment();
    
    pageImages.forEach((item) => {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'gallery-item';
      
      if (isBatchMode && selectedBatchImages.has(item.id)) {
        imgContainer.classList.add('selected');
      }
      
      if (isBatchMode) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'gallery-item-checkbox';
        checkbox.checked = selectedBatchImages.has(item.id);
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleBatchImageSelection(item.id);
        });
        imgContainer.appendChild(checkbox);
      }
      
      const img = document.createElement('img');
      img.src = item.imageBase64;
      img.alt = 'Gallery image';
      img.loading = 'lazy';
      
      imgContainer.appendChild(img);
      
      imgContainer.onclick = () => {
        if (isBatchMode) {
          toggleBatchImageSelection(item.id);
          showGallery(); // Refresh to update checkboxes
        } else {
          const originalIndex = galleryImages.findIndex(i => i.id === item.id);
          openImageViewer(originalIndex);
        }
      };
      
      fragment.appendChild(imgContainer);
    });
    
    grid.innerHTML = '';
    grid.appendChild(fragment);
    
    if (totalPages > 1) {
      pagination.style.display = 'flex';
      pageInfo.textContent = `Page ${currentGalleryPage} of ${totalPages}`;
      prevBtn.disabled = currentGalleryPage === 1;
      nextBtn.disabled = currentGalleryPage === totalPages;
    } else {
      pagination.style.display = 'none';
    }
  }
  
  modal.style.display = 'flex';
}

async function hideGallery() {
  document.getElementById('gallery-modal').style.display = 'none';
  currentGalleryPage = 1;
  await resumeCamera(); // Now this only happens when truly closing gallery
  
  // Restore status element display (in case it was hidden by upload function)
  if (statusElement) {
    statusElement.style.display = 'block';
  }
  
  // Re-show the style reveal footer
  if (noMagicMode) {
    if (statusElement) statusElement.textContent = '⚡ NO MAGIC MODE';
    showStyleReveal('⚡ NO MAGIC MODE');
  } else if (isTimerMode || isBurstMode || isMotionDetectionMode || isRandomMode || isMultiPresetMode) {
    let modeName = '';
    if (isTimerMode) modeName = '⏱️ Timer Mode';
    else if (isBurstMode) modeName = '📸 Burst Mode';
    else if (isMotionDetectionMode) modeName = '👁️ Motion Detection';
    else if (isRandomMode) modeName = '🎲 Random Mode';
    if (statusElement) statusElement.textContent = `${modeName} • ${CAMERA_PRESETS[currentPresetIndex] ? CAMERA_PRESETS[currentPresetIndex].name : ''}`;
    showStyleReveal(modeName);
  } else {
    // Update both footer AND popup immediately
    updatePresetDisplay();
  }
}

function nextGalleryPage() {
  const filteredImages = getFilteredAndSortedGallery();
  const totalPages = Math.ceil(filteredImages.length / ITEMS_PER_PAGE);
  if (currentGalleryPage < totalPages) {
    currentGalleryPage++;
    showGallery();
  }
}

function prevGalleryPage() {
  if (currentGalleryPage > 1) {
    currentGalleryPage--;
    showGallery();
  }
}

function onGalleryFilterChange() {
  currentGalleryPage = 1;
  showGallery();
}

function updateDateButtonText(type, dateValue) {
  const btnId = type === 'start' ? 'gallery-start-date-btn' : 'gallery-end-date-btn';
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  const textSpan = btn.querySelector('.date-button-text');
  if (!textSpan) return;
  
  if (dateValue) {
    const date = new Date(dateValue + 'T00:00:00');
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    textSpan.textContent = formatted;
    btn.classList.add('has-date');
  } else {
    textSpan.textContent = type === 'start' ? 'Start' : 'End';
    btn.classList.remove('has-date');
  }
}

function openImageViewer(index) {
  if (index < 0 || index >= galleryImages.length) return;
  
  currentViewerImageIndex = index;
  const item = galleryImages[index];
  
  const viewer = document.getElementById('image-viewer');
  const img = document.getElementById('viewer-image');
  const promptInput = document.getElementById('viewer-prompt');
  
  img.src = item.imageBase64;
  img.style.transform = 'scale(1) translate(0, 0)';
  viewerZoom = 1;
  
  promptInput.value = '';
  
  // Light up MP button if master prompt is enabled
  const mpBtn = document.getElementById('mp-viewer-button');
  if (mpBtn) {
    if (masterPromptEnabled) {
      mpBtn.classList.add('enabled');
    } else {
      mpBtn.classList.remove('enabled');
    }
  }
  
  viewer.style.display = 'flex';
  
  // hideGallery();

  document.getElementById('gallery-modal').style.display = 'none';
}

function closeImageViewer() {
  document.getElementById('image-viewer').style.display = 'none';
  currentViewerImageIndex = -1;
  viewerZoom = 1;
  
  // Show gallery again without resuming camera
  const modal = document.getElementById('gallery-modal');
  modal.style.display = 'flex';
  // Don't call showGallery() as it would reload everything
  // Just refresh the grid
  showGallery();
}

async function deleteViewerImage() {
  if (currentViewerImageIndex < 0 || currentViewerImageIndex >= galleryImages.length) {
    return;
  }
  
  if (await confirm('Delete this image from gallery?')) {
    const imageToDelete = galleryImages[currentViewerImageIndex];
    
    // Remove from IndexedDB
    await deleteImageFromDB(imageToDelete.id);
    
    // Remove from memory array
    galleryImages.splice(currentViewerImageIndex, 1);
    
    document.getElementById('image-viewer').style.display = 'none';
    currentViewerImageIndex = -1;
    viewerZoom = 1;
    
    showGallery();
  }
}

function showPresetSelector() {
  const modal = document.getElementById('preset-selector');
  
  // CRITICAL FIX: Reset multi-preset mode when entering single-select mode
  isMultiPresetMode = false;
  isBatchPresetSelectionActive = false;
  selectedPresets = [];
  
  // Hide multi-preset controls if they exist
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) {
    multiControls.style.display = 'none';
  }
  
  // Reset header to single-select mode
  const header = modal.querySelector('.preset-selector-header h3');
  if (header) {
    header.innerHTML = 'Select Preset (<span id="preset-count">0</span>)';
  }
  
  populatePresetList();

  // Initialize preset count display
  const presetCountElement = document.getElementById('preset-count');
  if (presetCountElement) {
    presetCountElement.textContent = CAMERA_PRESETS.length;
  }

  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();
  
  // Restore scroll position after DOM updates
  setTimeout(() => {
    const presetList = document.getElementById('preset-list');
    if (presetList && presetListScrollPosition > 0) {
      presetList.scrollTop = presetListScrollPosition;
    }
  }, 50);
}

function hidePresetSelector() {
  // Save scroll position before hiding
  const presetList = document.getElementById('preset-list');
  if (presetList) {
    presetListScrollPosition = presetList.scrollTop;
  }
  
  document.getElementById('preset-selector').style.display = 'none';
  presetFilterText = '';
  galleryPresetFilterByCategory = ''; // Clear category filter
  document.getElementById('preset-filter').value = '';
  isPresetSelectorOpen = false;
  currentPresetIndex_Gallery = 0;
  
  // Hide category hint
  const categoryHint = document.getElementById('preset-selector-category-hint');
  if (categoryHint) {
    categoryHint.style.display = 'none';
  }

  // Clear special mode flags
  isBatchPresetSelectionActive = false;
  isMultiPresetMode = false;
}

function scrollPresetListUp() {
  if (!isPresetSelectorOpen) return;
  
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0) return;

  currentPresetIndex_Gallery = Math.max(0, currentPresetIndex_Gallery - 1);
  updatePresetSelection();
}

function scrollPresetListDown() {
  if (!isPresetSelectorOpen) return;
  
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0) return;

  currentPresetIndex_Gallery = Math.min(items.length - 1, currentPresetIndex_Gallery + 1);
  updatePresetSelection();
}

function updatePresetSelection() {
  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0) return;

  // Remove previous selection
  items.forEach(item => {
    item.classList.remove('preset-selected');
  });

  // Add selection to current item
  if (currentPresetIndex_Gallery >= 0 && currentPresetIndex_Gallery < items.length) {
    const currentItem = items[currentPresetIndex_Gallery];
    currentItem.classList.add('preset-selected');
    
    // Scroll item into view
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    // Show category hint with individually clickable categories
    const presetName = currentItem.querySelector('.preset-name').textContent;
    const preset = CAMERA_PRESETS.find(p => p.name === presetName);
    const categoryHint = document.getElementById('preset-selector-category-hint');
    if (categoryHint && preset && preset.category && !isPresetFilterFocused) {
      // Clear previous content
      categoryHint.innerHTML = '';
      categoryHint.style.display = 'block';
      
      // Create a clickable span for each category
      preset.category.forEach((cat, index) => {
        const categorySpan = document.createElement('span');
        categorySpan.textContent = cat;
        categorySpan.style.cursor = 'pointer';
        categorySpan.style.padding = '0 2px';
        
        // Highlight if this category is currently being filtered
        if (galleryPresetFilterByCategory === cat) {
          categorySpan.style.textDecoration = 'underline';
          categorySpan.style.fontWeight = 'bold';
        }
        
        // Make each category clickable
        categorySpan.onclick = (e) => {
          e.stopPropagation();
          // If already filtering by this category, clear the filter
          if (galleryPresetFilterByCategory === cat) {
            galleryPresetFilterByCategory = '';
          } else {
            // Filter by this category
            galleryPresetFilterByCategory = cat;
          }
          currentPresetIndex_Gallery = 0;
          populatePresetList();
        };
        
        categoryHint.appendChild(categorySpan);
        
        // Add comma separator if not the last category
        if (index < preset.category.length - 1) {
          const comma = document.createElement('span');
          comma.textContent = ', ';
          categoryHint.appendChild(comma);
        }
      });
    } else if (categoryHint) {
      categoryHint.style.display = 'none';
    }
  }
}

function scrollSettingsUp() {
  if (!isSettingsSubmenuOpen) return;
  
  const submenu = document.getElementById('settings-submenu');
  if (!submenu) return;

  const items = submenu.querySelectorAll('.menu-section-button');
  if (items.length === 0) return;

  currentSettingsIndex = Math.max(0, currentSettingsIndex - 1);
  updateSettingsSelection();
}

function scrollSettingsDown() {
  if (!isSettingsSubmenuOpen) return;
  
  const submenu = document.getElementById('settings-submenu');
  if (!submenu) return;

  const items = submenu.querySelectorAll('.menu-section-button');
  if (items.length === 0) return;

  currentSettingsIndex = Math.min(items.length - 1, currentSettingsIndex + 1);
  updateSettingsSelection();
}

function updateSettingsSelection() {
  const submenu = document.getElementById('settings-submenu');
  if (!submenu) return;

  const items = submenu.querySelectorAll('.menu-section-button');
  if (items.length === 0) return;

  // Remove previous selection
  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  // Add selection to current item
  if (currentSettingsIndex >= 0 && currentSettingsIndex < items.length) {
    const currentItem = items[currentSettingsIndex];
    currentItem.classList.add('menu-selected');
    
    // Scroll item into view
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function scrollResolutionMenuUp() {
  const submenu = document.getElementById('resolution-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll('.resolution-item');
  if (items.length === 0) return;
  
  currentResolutionIndex_Menu = (currentResolutionIndex_Menu - 1 + items.length) % items.length;
  updateResolutionMenuSelection(items);
}

function scrollResolutionMenuDown() {
  const submenu = document.getElementById('resolution-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll('.resolution-item');
  if (items.length === 0) return;
  
  currentResolutionIndex_Menu = (currentResolutionIndex_Menu + 1) % items.length;
  updateResolutionMenuSelection(items);
}

function updateResolutionMenuSelection(items) {
  items.forEach(item => item.classList.remove('menu-selected'));
  
  if (currentResolutionIndex_Menu >= 0 && currentResolutionIndex_Menu < items.length) {
    const currentItem = items[currentResolutionIndex_Menu];
    currentItem.classList.add('menu-selected');
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function scrollBurstUp() {
  const submenu = document.getElementById('burst-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollBurstDown() {
  const submenu = document.getElementById('burst-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollTimerUp() {
  const submenu = document.getElementById('timer-settings-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollTimerDown() {
  const submenu = document.getElementById('timer-settings-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollMasterPromptUp() {
  const submenu = document.getElementById('master-prompt-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollMasterPromptDown() {
  const submenu = document.getElementById('master-prompt-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollMotionUp() {
  const submenu = document.getElementById('motion-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollMotionDown() {
  const submenu = document.getElementById('motion-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.submenu-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollPresetBuilderUp() {
  if (!isPresetBuilderSubmenuOpen) return;
  
  const submenu = document.getElementById('preset-builder-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.preset-builder-form');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollPresetBuilderDown() {
  if (!isPresetBuilderSubmenuOpen) return;
  
  const submenu = document.getElementById('preset-builder-submenu');
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const container = submenu.querySelector('.preset-builder-form');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollGalleryUp() {
  const modal = document.getElementById('gallery-modal');
  if (!modal || modal.style.display !== 'flex') return;
  
  const container = modal.querySelector('.gallery-scroll-container');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollGalleryDown() {
  const modal = document.getElementById('gallery-modal');
  if (!modal || modal.style.display !== 'flex') return;
  
  const container = modal.querySelector('.gallery-scroll-container');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollViewerUp() {
  const viewer = document.getElementById('image-viewer');
  if (!viewer || viewer.style.display !== 'flex') return;
  
  const container = viewer.querySelector('.viewer-controls');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollViewerDown() {
  const viewer = document.getElementById('image-viewer');
  if (!viewer || viewer.style.display !== 'flex') return;
  
  const container = viewer.querySelector('.viewer-controls');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function scrollEditorUp() {
    const editor = document.getElementById('style-editor');
    if (!editor || editor.style.display !== 'flex') return;
    
    const messageField = document.getElementById('style-message');
    const container = editor.querySelector('.style-editor-body');

    // If you are typing in the message field, scroll the field itself
    if (document.activeElement === messageField) {
        messageField.scrollTop = Math.max(0, messageField.scrollTop - 100);
    } else if (container) {
        // Otherwise scroll the whole modal
        container.scrollTop = Math.max(0, container.scrollTop - 200);
    }
}

function scrollEditorDown() {
    const editor = document.getElementById('style-editor');
    if (!editor || editor.style.display !== 'flex') return;
    
    const messageField = document.getElementById('style-message');
    const container = editor.querySelector('.style-editor-body');

    // If you are typing in the message field, scroll the field itself
    if (document.activeElement === messageField) {
        messageField.scrollTop = Math.min(messageField.scrollHeight - messageField.clientHeight, messageField.scrollTop + 100);
    } else if (container) {
        // Otherwise scroll the whole modal
        container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 200);
    }
}

function scrollQueueUp() {
  const queue = document.getElementById('queue-manager');
  if (!queue || queue.style.display !== 'flex') return;
  
  const container = queue.querySelector('.queue-list');
  if (container) {
    container.scrollTop = Math.max(0, container.scrollTop - 80);
  }
}

function scrollQueueDown() {
  const queue = document.getElementById('queue-manager');
  if (!queue || queue.style.display !== 'flex') return;
  
  const container = queue.querySelector('.queue-list');
  if (container) {
    container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + 80);
  }
}

function selectCurrentPresetItem() {
  if (!isPresetSelectorOpen) return;

  const presetList = document.getElementById('preset-list');
  if (!presetList) return;

  const items = presetList.querySelectorAll('.preset-item');
  if (items.length === 0 || currentPresetIndex_Gallery >= items.length) return;

  const currentItem = items[currentPresetIndex_Gallery];
  if (currentItem) {
    // Trigger the click event
    currentItem.click();
  }
}

function populatePresetList() {
  const list = document.getElementById('preset-list');
  list.innerHTML = '';
  
  const filtered = getVisiblePresets().filter(preset => {
    // First apply text search filter
    if (presetFilterText) {
      const searchText = presetFilterText.toLowerCase();
      const categoryMatch = preset.category && preset.category.some(cat => cat.toLowerCase().includes(searchText));
      const textMatch = preset.name.toLowerCase().includes(searchText) || 
             preset.message.toLowerCase().includes(searchText) ||
             categoryMatch;
      if (!textMatch) return false;
    }
    
    // Then apply category filter if active
    if (galleryPresetFilterByCategory) {
      return preset.category && preset.category.includes(galleryPresetFilterByCategory);
    }
    
    return true;
  });
  
  // Sort alphabetically by name
  const sortedAll = filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  // Separate favorites and regular presets
  const favorites = sortedAll.filter(p => isFavoriteStyle(p.name));
  const regular = sortedAll.filter(p => !isFavoriteStyle(p.name));
  
  // Combine: favorites first, then regular
  const sorted = [...favorites, ...regular];
  
  if (sorted.length === 0) {
    list.innerHTML = '<div class="preset-empty">No presets found</div>';
    return;
  }
  
  sorted.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    
    const name = document.createElement('div');
    name.className = 'preset-name';
    name.textContent = preset.name;
    
    const message = document.createElement('div');
    message.className = 'preset-description preset-description-hidden';
    message.textContent = preset.message;
    
    item.appendChild(name);
    item.appendChild(message);
    
    item.onclick = () => {
      // Toggle description visibility
      if (message.classList.contains('preset-description-hidden')) {
        message.classList.remove('preset-description-hidden');
      } else {
        // If description is showing, select the preset
        selectPreset(preset);
      }
    };
    
    list.appendChild(item);
  });
// Update preset count
  const presetCountElement = document.getElementById('preset-count');
  if (presetCountElement) {
    presetCountElement.textContent = sorted.length;
  }
}

async function selectPreset(preset) {
  // Multi-preset mode
  if (isMultiPresetMode) {
    const index = selectedPresets.findIndex(p => p.name === preset.name);
    if (index > -1) {
      selectedPresets.splice(index, 1);
    } else {
      selectedPresets.push(preset);
    }
    updateMultiPresetList();
    return;
  }
  
  // Batch processing mode
  if (window.batchProcessingActive) {
    window.batchProcessingActive = false;
    const imagesToProcess = window.batchImagesToProcess;
    window.batchImagesToProcess = null;
    
    hidePresetSelector();
    
    const modal = document.getElementById('preset-selector');
    const header = modal.querySelector('.preset-selector-header h3');
    header.textContent = 'Select Preset';
    
    await processBatchImages(preset, imagesToProcess);
    return;
  }
  
  // Normal preset selection for viewer
  const promptInput = document.getElementById('viewer-prompt');
  promptInput.value = preset.message;
  hidePresetSelector();
}

function submitMagicTransform() {
  if (currentViewerImageIndex < 0 || currentViewerImageIndex >= galleryImages.length) {
    alert('No image selected');
    return;
  }
  
  const promptInput = document.getElementById('viewer-prompt');
  let prompt = promptInput.value.trim();
  let presetName = 'Custom Prompt';
  let presetObj = null;
  
  // If no prompt entered, use a random preset
  if (!prompt) {
    const randomIndex = getRandomPresetIndex();
    const randomPreset = CAMERA_PRESETS[randomIndex];
    prompt = randomPreset.message;
    presetName = randomPreset.name;
    presetObj = randomPreset;
    
    // Show which preset was randomly selected
    alert(`Using random preset: ${presetName}`);
  }
  
  const item = galleryImages[currentViewerImageIndex];
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({
      message: getFinalPrompt(prompt, presetName, presetObj),
      pluginId: 'com.r1.pixelart',
      imageBase64: item.imageBase64
    }));
    
    alert('Magic transform submitted! You can submit again with a different prompt.');
  } else {
    alert('Magic transform sent: ' + prompt.substring(0, 50) + '...');
  }
}

// Batch Mode Functions
function toggleBatchMode() {
  isBatchMode = !isBatchMode;
  const toggleBtn = document.getElementById('batch-mode-toggle');
  const batchControls = document.getElementById('batch-controls');
  const batchActionBar = document.getElementById('batch-action-bar');
  
  if (isBatchMode) {
    toggleBtn.textContent = 'Done';
    toggleBtn.classList.add('active');
    batchControls.style.display = 'flex';
    batchActionBar.style.display = 'flex';
    selectedBatchImages.clear();
    updateBatchSelection();
    showGallery();
  } else {
    toggleBtn.textContent = 'Select';
    toggleBtn.classList.remove('active');
    batchControls.style.display = 'none';
    batchActionBar.style.display = 'none';
    selectedBatchImages.clear();
    showGallery();
  }
}

function updateBatchSelection() {
  const countElement = document.getElementById('batch-selected-count');
  const applyButton = document.getElementById('batch-apply-preset');
  const deleteButton = document.getElementById('batch-delete');
  
  countElement.textContent = `${selectedBatchImages.size} selected`;
  applyButton.disabled = selectedBatchImages.size === 0;
  if (deleteButton) {
    deleteButton.disabled = selectedBatchImages.size === 0;
  }
}

function selectAllBatchImages() {
  const filteredImages = getFilteredAndSortedGallery();
  selectedBatchImages.clear();
  filteredImages.forEach(img => selectedBatchImages.add(img.id));
  updateBatchSelection();
  showGallery();
}

function deselectAllBatchImages() {
  selectedBatchImages.clear();
  updateBatchSelection();
  showGallery();
}

function toggleBatchImageSelection(imageId) {
  if (selectedBatchImages.has(imageId)) {
    selectedBatchImages.delete(imageId);
  } else {
    selectedBatchImages.add(imageId);
  }
  updateBatchSelection();
}

async function applyPresetToBatch() {
  if (selectedBatchImages.size === 0) return;
  
  const modal = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.textContent = `Select Preset (${selectedBatchImages.size} images)`;

  // Set batch selection flag
  isBatchPresetSelectionActive = true;
  
  // Store which images to process
  const imagesToProcess = Array.from(selectedBatchImages);
  
  // Override selectPreset temporarily - store original first
  const originalSelectPreset = selectPreset;
  
  // Create a global flag
  window.batchProcessingActive = true;
  window.batchImagesToProcess = imagesToProcess;
  
  populatePresetList();
  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();
}

async function processBatchImages(preset, imagesToProcess) {
 // Clear batch selection flag
  isBatchPresetSelectionActive = false;
  const selectedIds = imagesToProcess || Array.from(selectedBatchImages);
  const total = selectedIds.length;
  
  const overlay = document.createElement('div');
  overlay.className = 'batch-progress-overlay';
  overlay.innerHTML = `
    <div class="batch-progress-text">Processing <span id="batch-current">0</span> / ${total}</div>
    <div class="batch-progress-bar">
      <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let processed = 0;
  
  for (const imageId of selectedIds) {
    const image = galleryImages.find(img => img.id === imageId);
    if (!image) continue;
    
    try {
      const finalPrompt = getFinalPrompt(preset.message, preset.name, preset);
      
      if (typeof PluginMessageHandler !== 'undefined') {
        PluginMessageHandler.postMessage(JSON.stringify({
          message: finalPrompt,
          pluginId: 'com.r1.pixelart',
          imageBase64: image.imageBase64
        }));
      }
      
      processed++;
      document.getElementById('batch-current').textContent = processed;
      document.getElementById('batch-progress-fill').style.width = `${(processed / total) * 100}%`;
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Failed to process image ${imageId}:`, error);
    }
  }
  
  document.body.removeChild(overlay);
  
  isBatchMode = false;
  selectedBatchImages.clear();
  toggleBatchMode();
  
  alert(`Batch processing complete! ${processed} of ${total} images submitted.`);
}

async function batchDeleteImages() {
  if (selectedBatchImages.size === 0) return;
  
  const count = selectedBatchImages.size;
  const confirmed = await confirm(`Are you sure you want to delete ${count} selected image${count > 1 ? 's' : ''}? This cannot be undone.`);
  
  if (!confirmed) return;
  
  const imagesToDelete = Array.from(selectedBatchImages);
  
  // Show progress
  const overlay = document.createElement('div');
  overlay.className = 'batch-progress-overlay';
  overlay.innerHTML = `
    <div class="batch-progress-text">Deleting <span id="batch-current">0</span> / ${count}</div>
    <div class="batch-progress-bar">
      <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let deleted = 0;
  
  for (const imageId of imagesToDelete) {
    try {
      await deleteImageFromDB(imageId);
      deleted++;
      document.getElementById('batch-current').textContent = deleted;
      document.getElementById('batch-progress-fill').style.width = `${(deleted / count) * 100}%`;
    } catch (error) {
      console.error(`Failed to delete image ${imageId}:`, error);
    }
  }
  
  document.body.removeChild(overlay);
  
  // Exit batch mode and reload gallery
  isBatchMode = false;
  selectedBatchImages.clear();
  await loadGallery();
  toggleBatchMode();
  
  alert(`${deleted} of ${count} image${deleted > 1 ? 's' : ''} deleted successfully.`);
}

function openMultiPresetSelector(imageId) {
  multiPresetImageId = imageId;
  selectedPresets = [];
  isMultiPresetMode = true;
  
  const modal = document.getElementById('preset-selector');
  const header = modal.querySelector('.preset-selector-header h3');
  header.innerHTML = 'Select Presets <span id="multi-preset-count" style="font-size: 12px; color: #666;">(0 selected)</span>';
  
  // Add multi-select controls if not already there
  let multiControls = document.getElementById('multi-preset-controls');
  if (!multiControls) {
    multiControls = document.createElement('div');
    multiControls.id = 'multi-preset-controls';
    multiControls.style.cssText = 'padding: 0 8px; background: #f5f5f5; border-bottom: 1px solid #ddd; display: flex; gap: 8px; justify-content: space-between; align-items: stretch;';
    multiControls.innerHTML = `
      <button id="multi-preset-apply" class="batch-control-button" style="background: #4CAF50; color: white;">Apply Selected</button>
      <button id="multi-preset-cancel" class="batch-control-button">Cancel</button>
    `;
    
    const presetFilter = document.getElementById('preset-filter');
    const presetList = document.getElementById('preset-list');
    presetFilter.parentNode.insertBefore(multiControls, presetFilter);
    presetFilter.parentNode.insertBefore(presetFilter, presetList);
  }
  multiControls.style.display = 'flex';
  
  populatePresetList();
  updateMultiPresetList();
  modal.style.display = 'flex';
  isPresetSelectorOpen = true;
  currentPresetIndex_Gallery = 0;
  updatePresetSelection();
  
  // Add event listeners for multi-preset controls
  document.getElementById('multi-preset-apply').onclick = applyMultiplePresets;
  document.getElementById('multi-preset-cancel').onclick = cancelMultiPresetMode;
}

function updateMultiPresetList() {
  const presetList = document.getElementById('preset-list');
  const items = presetList.querySelectorAll('.preset-item');
  
  items.forEach(item => {
    const presetName = item.querySelector('.preset-name').textContent;
    const isSelected = selectedPresets.some(p => p.name === presetName);
    
    if (isSelected) {
      item.style.background = '#e8f5e9';
      item.style.border = '2px solid #4CAF50';
    } else {
      item.style.background = '';
      item.style.border = '';
    }
  });
  
  const countSpan = document.getElementById('multi-preset-count');
  if (countSpan) {
    countSpan.textContent = `(${selectedPresets.length} selected)`;
  }
}

function cancelMultiPresetMode() {
  isMultiPresetMode = false;
  multiPresetImageId = null;
  selectedPresets = [];
  
  const multiControls = document.getElementById('multi-preset-controls');
  if (multiControls) {
    multiControls.style.display = 'none';
  }
  
  const header = document.querySelector('.preset-selector-header h3');
  header.textContent = 'Select Preset';
  
  hidePresetSelector();
}

async function applyMultiplePresets() {
  if (selectedPresets.length === 0) {
    alert('Please select at least one preset');
    return;
  }
  
  if (!multiPresetImageId) {
    alert('No image selected');
    return;
  }
  
  const image = galleryImages.find(img => img.id === multiPresetImageId);
  if (!image) {
    alert('Image not found');
    return;
  }
  
  // Save presets before canceling mode (which clears the array)
  const presetsToApply = [...selectedPresets];
  
  cancelMultiPresetMode();
  
  // Show progress
  const overlay = document.createElement('div');
  overlay.className = 'batch-progress-overlay';
  overlay.innerHTML = `
    <div class="batch-progress-text">Applying preset <span id="batch-current">0</span> / ${presetsToApply.length}</div>
    <div class="batch-progress-bar">
      <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let processed = 0;
  
  for (const preset of presetsToApply) {
    try {
      const finalPrompt = getFinalPrompt(preset.message, preset.name, preset);
      
      if (typeof PluginMessageHandler !== 'undefined') {
        PluginMessageHandler.postMessage(JSON.stringify({
          message: finalPrompt,
          pluginId: 'com.r1.pixelart',
          imageBase64: image.imageBase64
        }));
      }
      
      processed++;
      document.getElementById('batch-current').textContent = processed;
      document.getElementById('batch-progress-fill').style.width = `${(processed / presetsToApply.length) * 100}%`;
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Failed to apply preset ${preset.name}:`, error);
    }
  }
  
  document.body.removeChild(overlay);
  alert(`${processed} preset${processed > 1 ? 's' : ''} applied successfully!`);
}

function setupViewerPinchZoom() {
  const img = document.getElementById('viewer-image');
  const container = document.querySelector('.image-viewer-container');
  
  let translateX = 0;
  let translateY = 0;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  
  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      viewerIsPinching = true;
      viewerInitialPinchDistance = getDistance(e.touches[0], e.touches[1]);
      viewerInitialZoom = viewerZoom;
    } else if (e.touches.length === 1 && viewerZoom > 1) {
      isDragging = true;
      startX = e.touches[0].clientX - translateX;
      startY = e.touches[0].clientY - translateY;
    }
  }, { passive: false });
  
  container.addEventListener('touchmove', (e) => {
    if (viewerIsPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / viewerInitialPinchDistance;
      viewerZoom = Math.max(1, Math.min(viewerInitialZoom * scale, 5));
      
      img.style.transform = `scale(${viewerZoom}) translate(${translateX}px, ${translateY}px)`;
    } else if (isDragging && e.touches.length === 1 && viewerZoom > 1) {
      e.preventDefault();
      translateX = e.touches[0].clientX - startX;
      translateY = e.touches[0].clientY - startY;
      
      img.style.transform = `scale(${viewerZoom}) translate(${translateX}px, ${translateY}px)`;
    }
  }, { passive: false });
  
  container.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      viewerIsPinching = false;
    }
    if (e.touches.length === 0) {
      isDragging = false;
      if (viewerZoom === 1) {
        translateX = 0;
        translateY = 0;
        img.style.transform = 'scale(1) translate(0, 0)';
      }
    }
  });
  
  container.addEventListener('touchcancel', () => {
    viewerIsPinching = false;
    isDragging = false;
  });
}

function getDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function updateMenuSelection() {
  if (!isMenuOpen) return;

  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  currentMenuIndex = Math.max(0, Math.min(currentMenuIndex, items.length - 1));

  const currentItem = items[currentMenuIndex];
  if (currentItem) {
    currentItem.classList.add('menu-selected');
    
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
    
    // Show category hint with individually clickable categories
    const presetIndex = parseInt(currentItem.dataset.index);
    const preset = CAMERA_PRESETS[presetIndex];
    const categoryHint = document.getElementById('menu-category-hint');
    if (categoryHint && preset && preset.category && !isStyleFilterFocused) {
      // Clear previous content
      categoryHint.innerHTML = '';
      categoryHint.style.display = 'block';
      
      // Create a clickable span for each category
      preset.category.forEach((cat, index) => {
        const categorySpan = document.createElement('span');
        categorySpan.textContent = cat;
        categorySpan.style.cursor = 'pointer';
        categorySpan.style.padding = '0 2px';
        
        // Highlight if this category is currently being filtered
        if (mainMenuFilterByCategory === cat) {
          categorySpan.style.textDecoration = 'underline';
          categorySpan.style.fontWeight = 'bold';
        }
        
        // Make each category clickable
        categorySpan.onclick = (e) => {
          e.stopPropagation();
          // If already filtering by this category, clear the filter
          if (mainMenuFilterByCategory === cat) {
            mainMenuFilterByCategory = '';
          } else {
            // Filter by this category
            mainMenuFilterByCategory = cat;
          }
          currentMenuIndex = 0;
          populateStylesList();
        };
        
        categoryHint.appendChild(categorySpan);
        
        // Add comma separator if not the last category
        if (index < preset.category.length - 1) {
          const comma = document.createElement('span');
          comma.textContent = ', ';
          categoryHint.appendChild(comma);
        }
      });
    } else if (categoryHint) {
      categoryHint.style.display = 'none';
    }
  }
}

let currentSubmenuIndex = 0;

function scrollSubmenuUp(submenuId, itemSelector) {
  const submenu = document.getElementById(submenuId);
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll(itemSelector);
  if (items.length === 0) return;
  
  currentSubmenuIndex = (currentSubmenuIndex - 1 + items.length) % items.length;
  updateSubmenuSelection(submenu, items);
}

function scrollSubmenuDown(submenuId, itemSelector) {
  const submenu = document.getElementById(submenuId);
  if (!submenu || submenu.style.display !== 'flex') return;
  
  const items = submenu.querySelectorAll(itemSelector);
  if (items.length === 0) return;
  
  currentSubmenuIndex = (currentSubmenuIndex + 1) % items.length;
  updateSubmenuSelection(submenu, items);
}

function updateSubmenuSelection(submenu, items) {
  items.forEach(item => item.classList.remove('menu-selected'));
  
  if (currentSubmenuIndex >= 0 && currentSubmenuIndex < items.length) {
    const currentItem = items[currentSubmenuIndex];
    currentItem.classList.add('menu-selected');
    currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function resetSubmenuIndex() {
  currentSubmenuIndex = 0;
}

function scrollMenuUp() {
  if (!isMenuOpen || !menuScrollEnabled) return;
  
  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentMenuIndex = Math.max(0, currentMenuIndex - 1);
  updateMenuSelection();
}

function scrollMenuDown() {
  if (!isMenuOpen || !menuScrollEnabled) return;
  
  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentMenuIndex = Math.min(items.length - 1, currentMenuIndex + 1);
  updateMenuSelection();
}

function selectCurrentMenuItem() {
  if (!isMenuOpen || !menuScrollEnabled) return;

  const stylesList = document.getElementById('menu-styles-list');
  if (!stylesList) return;

  const items = stylesList.querySelectorAll('.style-item');
  if (items.length === 0 || currentMenuIndex >= items.length) return;

  const currentItem = items[currentMenuIndex];
  if (currentItem) {
    const styleNameElement = currentItem.querySelector('.style-name');
    if (styleNameElement) {
      const sortedPresets = getSortedPresets();
      const selectedPreset = sortedPresets[currentMenuIndex];
      if (selectedPreset) {
        const originalIndex = CAMERA_PRESETS.findIndex(p => p === selectedPreset);
        if (originalIndex !== -1) {
          currentPresetIndex = originalIndex;
          updatePresetDisplay();
          hideUnifiedMenu();
        }
      }
    }
  }
}

// Load saved styles
async function loadStyles() {
    // Initialize IndexedDB storage
    await presetStorage.init();
    await presetImporter.init();
    
    // Check if this is truly a first-time user
    const importedPresets = await presetImporter.loadImportedPresets();
    const hasImports = importedPresets.length > 0;
    
    // Check if there are any user modifications
    const modifications = await presetStorage.getAllModifications();
    const hasModifications = modifications.length > 0;
    
    // Only load presets if user has imports or modifications
    if (hasImports || hasModifications) {
        // Merge factory presets with user modifications
        CAMERA_PRESETS = await mergePresetsWithStorage();
    } else {
        // First time user - don't load anything yet
        CAMERA_PRESETS = [];
        
        // Show a message that they need to import presets
        setTimeout(async () => {
            const shouldImport = await confirm('Welcome! You should import presets to get started. Would you like to import now?');
            if (shouldImport) {
                document.getElementById('menu-button').click();
                setTimeout(() => {
                    document.getElementById('settings-menu-button').click();
                    setTimeout(() => {
                        document.getElementById('import-presets-button').click();
                    }, 100);
                }, 100);
            }
        }, 500);
    }
    
    // Still load old localStorage custom presets for migration
    const storedStyles = localStorage.getItem(STORAGE_KEY);
    if (storedStyles) {
        try {
            const loadedStyles = JSON.parse(storedStyles);
            
            // Only add custom presets (those with internal: false)
            const customPresets = loadedStyles.filter(p => p.internal === false);
            
            // Migrate old custom presets to new storage
            for (const preset of customPresets) {
                await presetStorage.saveNewPreset(preset);
                if (!CAMERA_PRESETS.find(p => p.name === preset.name)) {
                    CAMERA_PRESETS.push(preset);
                }
            }
            
            // Clear old storage after migration
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.error("Error loading styles:", e);
        }
    }
    
    const favoritesJson = localStorage.getItem(FAVORITE_STYLES_KEY);
    if (favoritesJson) {
        try {
            favoriteStyles = JSON.parse(favoritesJson);
            if (!Array.isArray(favoriteStyles)) {
                favoriteStyles = []; 
            }
        } catch (e) {
            console.error("Error parsing favorite styles:", e);
            favoriteStyles = []; 
        }
    }
    
    loadLastUsedStyle(); 
    
    loadResolution();
    // loadWhiteBalanceSettings();
    
    // Load visible presets
    const visibleJson = localStorage.getItem(VISIBLE_PRESETS_KEY);
    if (visibleJson) {
        try {
            visiblePresets = JSON.parse(visibleJson);
            if (!Array.isArray(visiblePresets)) {
                visiblePresets = [];
            }
        } catch (e) {
            console.error("Error parsing visible presets:", error);
            visiblePresets = [];
        }
    }
    
    // Clean up visible presets - remove any preset names that no longer exist in CAMERA_PRESETS
    const validPresetNames = new Set(CAMERA_PRESETS.map(p => p.name));
    const originalLength = visiblePresets.length;
    visiblePresets = visiblePresets.filter(name => validPresetNames.has(name));
    
    // If we removed any invalid names, save the cleaned list
    if (originalLength !== visiblePresets.length) {
        saveVisiblePresets();
    }
    
    // If no visible presets saved, show all by default
    if (visiblePresets.length === 0 && CAMERA_PRESETS.length > 0) {
        visiblePresets = CAMERA_PRESETS.map(p => p.name);
        saveVisiblePresets();
    }
    
    // Update the display to show correct count on startup
    updateVisiblePresetsDisplay();

// Check for updates after loading
  setTimeout(() => {
    checkForPresetsUpdates();
  }, 1000);
}

// Check for updates on startup
async function checkForPresetsUpdates() {
  try {
    const response = await fetch('./presets.json');
    if (!response.ok) return;
    
    const jsonPresets = await response.json();
    const importedPresets = presetImporter.getImportedPresets();
    
    if (importedPresets.length === 0) return;
    
    let hasUpdates = false;
    const importedNames = new Set(importedPresets.map(p => p.name));
    
    // Check for updated or new presets
    for (const jsonPreset of jsonPresets) {
      const existing = importedPresets.find(p => p.name === jsonPreset.name);
      if (!existing || existing.message !== jsonPreset.message) {
        hasUpdates = true;
        break;
      }
    }
    
    if (hasUpdates) {
      // Add NEW badge to button in settings
      const statusElement = document.getElementById('updates-status');
      if (statusElement) {
        statusElement.textContent = '🔴 Updates available';
        statusElement.style.color = '#FF5722';
        statusElement.style.fontWeight = 'bold';
      }
      
      // Store that updates are available
      window.hasPresetsUpdates = true;
    }
  } catch (error) {
    console.log('Could not check for updates:', error);
  }
}

// Update master prompt indicator visibility
function updateMasterPromptIndicator() {
  const mpIndicator = document.getElementById('master-prompt-indicator');
  const startScreen = document.getElementById('start-screen');
  if (mpIndicator) {
    // Only show if master prompt enabled AND start screen is gone
    mpIndicator.style.display = (masterPromptEnabled && !startScreen) ? 'block' : 'none';
  }
}

async function mergePresetsWithStorage() {
  const modifications = await presetStorage.getAllModifications();
  const deletedNames = new Set();
  const modifiedData = new Map();
  const newPresets = [];

  // Process all stored modifications
  for (const record of modifications) {
    if (record.type === 'deletion') {
      deletedNames.add(record.name);
    } else if (record.type === 'modification') {
      modifiedData.set(record.name, record.data);
    } else if (record.type === 'new') {
      newPresets.push(record.data);
    }
  }

  // Check if user has imported presets
  const importedPresets = await presetImporter.loadImportedPresets();
  hasImportedPresets = importedPresets.length > 0;
  
  let basePresets;
  
  if (hasImportedPresets) {
    // Use imported presets
    basePresets = importedPresets;
  } else {
    // First time user - load factory presets only now
    if (factoryPresets.length === 0) {
      const response = await fetch('./presets.json');
      if (response.ok) {
        DEFAULT_PRESETS = await response.json();
        factoryPresets = [...DEFAULT_PRESETS];
      } else {
        DEFAULT_PRESETS = [];
        factoryPresets = [];
      }
    }
    basePresets = factoryPresets;
  }

  // Apply modifications and filter deletions
  const mergedPresets = basePresets
    .filter(preset => !deletedNames.has(preset.name))
    .map(preset => {
      if (modifiedData.has(preset.name)) {
        return { ...preset, ...modifiedData.get(preset.name) };
      }
      return { ...preset };
    });

  // Add new user-created presets
  return [...mergedPresets, ...newPresets];
}

// Save visible presets to localStorage
function saveVisiblePresets() {
    try {
        localStorage.setItem(VISIBLE_PRESETS_KEY, JSON.stringify(visiblePresets));
    } catch (err) {
        console.error('Error saving visible presets:', err);
    }
}

// Get only visible presets
function getVisiblePresets() {
    return CAMERA_PRESETS.filter(preset => visiblePresets.includes(preset.name));
}

// Save resolution setting
function saveResolution(index) {
  try {
    localStorage.setItem(RESOLUTION_STORAGE_KEY, index.toString());
  } catch (err) {
    console.error('Error saving resolution:', err);
  }
}

// ========== WHITE BALANCE FUNCTIONS - COMMENTED OUT ==========
// // Load white balance settings
// function loadWhiteBalanceSettings() {
//   const saved = localStorage.getItem(WHITE_BALANCE_STORAGE_KEY);
//   if (saved !== null) {
//     currentWhiteBalanceIndex = parseInt(saved);
//   }
// }

// // Save white balance settings
// function saveWhiteBalanceSettings() {
//   localStorage.setItem(WHITE_BALANCE_STORAGE_KEY, currentWhiteBalanceIndex.toString());
// }

// // Apply white balance filter
// function applyWhiteBalance() {
//   if (!video) return;
//   
//   // Small delay to ensure video is ready
//   setTimeout(() => {
//     const mode = WHITE_BALANCE_MODES[currentWhiteBalanceIndex];
//     
//     // Remove existing filter
//     video.style.filter = '';
//     
//     // Apply CSS filter based on mode
//     switch(mode.value) {
//       case 'daylight':
//         video.style.filter = 'brightness(1.05) saturate(1.1)';
//         break;
//       case 'cloudy':
//         video.style.filter = 'brightness(1.1) saturate(0.95) sepia(0.05)';
//         break;
//       case 'tungsten':
//         video.style.filter = 'brightness(0.95) saturate(1.15) hue-rotate(-10deg)';
//         break;
//       case 'fluorescent':
//         video.style.filter = 'brightness(1.02) saturate(1.05) hue-rotate(5deg)';
//         break;
//       case 'candlelight':
//         video.style.filter = 'brightness(0.85) saturate(1.3) sepia(0.15) hue-rotate(-15deg)';
//         break;
//       case 'moonlight':
//         video.style.filter = 'brightness(0.7) saturate(0.8) hue-rotate(15deg) contrast(1.1)';
//         break;
//       case 'auto':
//       default:
//         video.style.filter = '';
//         break;
//     }
//   }, 50);
// }

// function applyWhiteBalanceToCanvas(ctx, width, height) {
//   const mode = WHITE_BALANCE_MODES[currentWhiteBalanceIndex];
//   
//   if (mode.value === 'auto') {
//     return; // No adjustment needed
//   }
//   
//   // Get image data
//   const imageData = ctx.getImageData(0, 0, width, height);
//   const data = imageData.data;
//   
//   // Define adjustments for each mode
//   let brightness = 1.0;
//   let saturation = 1.0;
//   let warmth = 0; // Positive = warmer (red/yellow), Negative = cooler (blue)
//   let contrast = 1.0;
//   
//   switch(mode.value) {
//     case 'daylight':
//       brightness = 1.05;
//       saturation = 1.1;
//       warmth = 5;
//       break;
//     case 'cloudy':
//       brightness = 1.1;
//       saturation = 0.95;
//       warmth = 10;
//       break;
//     case 'tungsten':
//       brightness = 0.95;
//       saturation = 1.15;
//       warmth = -20;
//       break;
//     case 'fluorescent':
//       brightness = 1.02;
//       saturation = 1.05;
//       warmth = -10;
//       break;
//     case 'candlelight':
//       brightness = 0.85;
//       saturation = 1.3;
//       warmth = 25;
//       contrast = 0.95;
//       break;
//     case 'moonlight':
//       brightness = 0.7;
//       saturation = 0.8;
//       warmth = -15;
//       contrast = 1.1;
//       break;
//   }
//   
//   // Apply adjustments to each pixel
//   for (let i = 0; i < data.length; i += 4) {
//     let r = data[i];
//     let g = data[i + 1];
//     let b = data[i + 2];
//     
//     // Apply warmth (shift towards red/yellow or blue)
//     if (warmth > 0) {
//       r = Math.min(255, r + warmth);
//       g = Math.min(255, g + warmth * 0.5);
//     } else if (warmth < 0) {
//       b = Math.min(255, b - warmth);
//     }
//     
//     // Apply brightness
//     r *= brightness;
//     g *= brightness;
//     b *= brightness;
//     
//     // Apply saturation
//     const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
//     r = gray + saturation * (r - gray);
//     g = gray + saturation * (g - gray);
//     b = gray + saturation * (b - gray);
//     
//     // Apply contrast
//     r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
//     g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
//     b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
//     
//     // Clamp values
//     data[i] = Math.max(0, Math.min(255, r));
//     data[i + 1] = Math.max(0, Math.min(255, g));
//     data[i + 2] = Math.max(0, Math.min(255, b));
//   }
//   
//   // Put modified image data back
//   ctx.putImageData(imageData, 0, 0);
// }

// function showWhiteBalanceSubmenu() {
//   document.getElementById('settings-submenu').style.display = 'none';
//   
//   const submenu = document.getElementById('white-balance-submenu');
//   const list = document.getElementById('white-balance-list');
//   list.innerHTML = '';
//   
//   WHITE_BALANCE_MODES.forEach((mode, index) => {
//     const item = document.createElement('div');
//     item.className = 'resolution-item';
//     if (index === currentWhiteBalanceIndex) {
//       item.classList.add('active');
//     }
//     
//     const name = document.createElement('span');
//     name.className = 'resolution-name';
//     name.textContent = mode.name;
//     
//     item.appendChild(name);
//     
//     item.onclick = () => {
//       currentWhiteBalanceIndex = index;
//       saveWhiteBalanceSettings();
//       document.getElementById('current-white-balance-display').textContent = mode.name;
//       if (stream) {
//         applyWhiteBalance();
//       }
//       hideWhiteBalanceSubmenu();
//     };
//     
//     list.appendChild(item);
//   });
//   
//   submenu.style.display = 'flex';
// }

// function hideWhiteBalanceSubmenu() {
//   document.getElementById('white-balance-submenu').style.display = 'none';
//   document.getElementById('settings-submenu').style.display = 'flex';
// }
// ========== END WHITE BALANCE FUNCTIONS ==========

// Load resolution setting
function loadResolution() {
  try {
    const saved = localStorage.getItem(RESOLUTION_STORAGE_KEY);
    if (saved !== null) {
      const index = parseInt(saved, 10);
      if (index >= 0 && index < RESOLUTION_PRESETS.length) {
        currentResolutionIndex = index;
      }
    }
  } catch (err) {
    console.error('Error loading resolution:', err);
  }
}

function getStylesLists() {
    const presets = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
    
    const sortedAll = presets.slice().sort((a, b) => a.name.localeCompare(b.name));
    
    const favorites = sortedAll.filter(p => isFavoriteStyle(p.name));
    
    const regular = sortedAll.filter(p => !isFavoriteStyle(p.name));

    return { favorites, regular };
}

function getSortedPresets() {
    const { favorites, regular } = getStylesLists();
    // Filter to only visible presets
    const visibleFavorites = favorites.filter(p => visiblePresets.includes(p.name));
    const visibleRegular = regular.filter(p => visiblePresets.includes(p.name));
    return [...visibleFavorites, ...visibleRegular];
}

// Get the current preset's position in the sorted array
function getCurrentSortedIndex() {
  const sortedPresets = getSortedPresets();
  const currentPreset = CAMERA_PRESETS[currentPresetIndex];
  return sortedPresets.findIndex(p => p === currentPreset);
}

// Get original index from sorted index
function getOriginalIndexFromSorted(sortedIndex) {
  const sortedPresets = getSortedPresets();
  const preset = sortedPresets[sortedIndex];
  return CAMERA_PRESETS.findIndex(p => p === preset);
}

// Save styles to localStorage
function saveStyles() {
  // LEGACY FUNCTION - kept for backward compatibility during migration period
  // New presets are saved to IndexedDB via presetStorage.saveNewPreset()
  // This function only exists to support old localStorage-based presets
  // and can be removed in a future version after migration period
  try {
    const customPresets = CAMERA_PRESETS.filter(p => p.internal === false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets));
  } catch (err) {
    console.error('Error saving styles:', err);
  }
}

function createStyleMenuItem(preset) {
    const originalIndex = CAMERA_PRESETS.findIndex(p => p === preset);
    
    const item = document.createElement('div');
    item.className = 'style-item';
    
    if (originalIndex === currentPresetIndex) {
        item.classList.add('active');
    }
    
    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = preset.name;
    
    const favBtn = document.createElement('button');
    favBtn.className = 'style-favorite';
    favBtn.textContent = isFavoriteStyle(preset.name) ? '⭐' : '☆'; 
    favBtn.onclick = (e) => {
        e.stopPropagation();
        saveFavoriteStyle(preset.name); 
    };
    
    const editBtn = document.createElement('button');
    editBtn.className = 'style-edit';
    
    // Check if this is a user-created preset (has internal: false explicitly set)
    const isUserPreset = (preset.internal === false);
    
    if (isUserPreset) {
        editBtn.textContent = 'Builder';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editPresetInBuilder(originalIndex);
        };
    } else {
        editBtn.textContent = 'Edit';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editStyle(originalIndex);
        };
    }
         
    item.appendChild(favBtn);
    item.appendChild(name);
    item.appendChild(editBtn);
    
    item.onclick = () => {
        currentPresetIndex = originalIndex;
        updatePresetDisplay();
        hideUnifiedMenu();
    };
    
    return item;
}

// Save favorite style
function saveFavoriteStyle(styleName) {
    const index = favoriteStyles.indexOf(styleName);
    
    if (index > -1) {
        favoriteStyles.splice(index, 1);
    } else {
        favoriteStyles.push(styleName);
    }

    localStorage.setItem(FAVORITE_STYLES_KEY, JSON.stringify(favoriteStyles));
    
    // Save current scroll position before repopulating
    const scrollContainer = document.querySelector('.styles-menu-scroll-container');
    const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
    
    populateStylesList();
    
    // Restore scroll position after repopulating
    if (scrollContainer) {
        scrollContainer.scrollTop = scrollPosition;
    }
}

function loadLastUsedStyle() {
    const savedIndex = localStorage.getItem(LAST_USED_PRESET_KEY);
    
    if (savedIndex !== null) {
        try {
            const index = parseInt(savedIndex, 10);
            if (index >= 0 && index < CAMERA_PRESETS.length) {
                currentPresetIndex = index;
            }
        } catch (err) {
            console.error('Error loading last used style:', err);
        }
    }
}

// Check if style is favorited
function isFavoriteStyle(styleName) {
    return favoriteStyles.includes(styleName);
}

// Get random preset index from favorites (or all presets if no favorites)
function getRandomPresetIndex() {
  // Get visible presets using the same logic as scroll wheel
  const sortedPresets = getSortedPresets();
  
  if (sortedPresets.length === 0) return 0;
  
  // Filter to only favorites if they exist
  const favoritedVisible = sortedPresets.filter(p => isFavoriteStyle(p.name));
  
  if (favoritedVisible.length > 0) {
    const randomPreset = favoritedVisible[Math.floor(Math.random() * favoritedVisible.length)];
    return CAMERA_PRESETS.findIndex(p => p === randomPreset);
  }
  
  // Otherwise pick from all visible presets
  const randomPreset = sortedPresets[Math.floor(Math.random() * sortedPresets.length)];
  return CAMERA_PRESETS.findIndex(p => p === randomPreset);
}

function toggleMotionDetection() {
  isMotionDetectionMode = !isMotionDetectionMode;
  const btn = document.getElementById('motion-toggle');
  
  if (isMotionDetectionMode) {
    btn.classList.add('active');
    btn.title = 'Motion Detection: ON';
    statusElement.textContent = noMagicMode 
      ? `⚡ NO MAGIC MODE • 👁️ Motion Detection`
      : `Motion Detection mode ON • ${CAMERA_PRESETS[currentPresetIndex].name}`;
    showStyleReveal('👁️ Motion Detection');
    } else {
    btn.classList.remove('active');
    btn.title = 'Motion Detection: OFF';
    stopMotionDetection();
    
    // Clear any active countdown
    if (motionStartInterval) {
      clearInterval(motionStartInterval);
      motionStartInterval = null;
    }
    
    // Hide countdown display
    const countdownElement = document.getElementById('timer-countdown');
    if (countdownElement) {
      countdownElement.style.display = 'none';
      countdownElement.classList.remove('countdown-fade-in', 'countdown-fade-out');
    }

    // Restore camera button visibility
    const cameraButton = document.getElementById('camera-button');
    if (cameraButton && availableCameras.length > 1) {
      cameraButton.style.display = 'flex';
    }
    
    // Show current preset when motion detection is turned off
    if (CAMERA_PRESETS && CAMERA_PRESETS[currentPresetIndex]) {
      statusElement.textContent = noMagicMode
        ? `⚡ NO MAGIC MODE`
        : `Style: ${CAMERA_PRESETS[currentPresetIndex].name}`;
      showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
    }
  }
}

function getStartDelaySliderValue() {
  for (let key in MOTION_START_DELAYS) {
    if (MOTION_START_DELAYS[key].seconds === motionStartDelay) {
      return parseInt(key);
    }
  }
  return 1; // Default to 3s
}

function showMotionSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  document.getElementById('motion-submenu').style.display = 'flex';
  isMotionSubmenuOpen = true;
  isSettingsSubmenuOpen = false;
}

function hideMotionSubmenu() {
  document.getElementById('motion-submenu').style.display = 'none';
  isMotionSubmenuOpen = false;
  showSettingsSubmenu();
}

function showVisiblePresetsSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  document.getElementById('visible-presets-submenu').style.display = 'flex';
  isMenuOpen = false; // ADD THIS LINE
  isVisiblePresetsSubmenuOpen = true;
  visiblePresetsScrollEnabled = true;
  isSettingsSubmenuOpen = false;
  currentVisiblePresetsIndex = 0;
  visiblePresetsFilterText = '';
  document.getElementById('visible-presets-filter').value = '';
  populateVisiblePresetsList();
  updateVisiblePresetsDisplay();
}

function hideVisiblePresetsSubmenu() {
  document.getElementById('visible-presets-submenu').style.display = 'none';
  isVisiblePresetsSubmenuOpen = false;
  visiblePresetsScrollEnabled = false;
  currentVisiblePresetsIndex = 0;
  visiblePresetsFilterText = '';
  visiblePresetsFilterByCategory = ''; // Clear category filter
  // Hide category hint
  const categoryHint = document.getElementById('visible-presets-category-hint');
  if (categoryHint) {
    categoryHint.style.display = 'none';
  }
  showSettingsSubmenu();
}

// Show Preset Builder submenu
function showPresetBuilderSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  document.getElementById('preset-builder-submenu').style.display = 'flex';
  
  isMenuOpen = false;
  isSettingsSubmenuOpen = false;
  isPresetBuilderSubmenuOpen = true;
  
  // Clear the form
  clearPresetBuilderForm();
}

function hidePresetBuilderSubmenu() {
  document.getElementById('preset-builder-submenu').style.display = 'none';
  isPresetBuilderSubmenuOpen = false;
  editingPresetBuilderIndex = -1;
  
  // Hide delete button when closing
  const deleteButton = document.getElementById('preset-builder-delete');
  if (deleteButton) deleteButton.style.display = 'none';
  
  showSettingsSubmenu();
}

// Clear Preset Builder form
function clearPresetBuilderForm() {
  editingPresetBuilderIndex = -1;
  document.getElementById('preset-builder-name').value = '';
  document.getElementById('preset-builder-category').value = '';
  document.getElementById('preset-builder-template').value = '';
  document.getElementById('preset-builder-prompt').value = '';
  
  // Show clear button and hide delete button when creating new preset
  const deleteButton = document.getElementById('preset-builder-delete');
  if (deleteButton) deleteButton.style.display = 'none';
  
  const clearButton = document.getElementById('preset-builder-clear');
  if (clearButton) clearButton.style.display = 'flex';

  // Clear options section
  initOptionsSection(null);
  
  // Close options section
  const optionsContent = document.getElementById('preset-options-section-content');
  if (optionsContent) optionsContent.style.display = 'none';
  
  // Close all chip sections when clearing
  document.querySelectorAll('.chip-section-content').forEach(c => {
    c.style.display = 'none';
  });
  document.querySelectorAll('.chip-section-header').forEach(h => {
    h.classList.remove('expanded');
  });
}

// Get options from the preset builder form
function getOptionsFromForm() {
  const optionsContainer = document.getElementById('preset-options-list');
  if (!optionsContainer) return [];
  
  const optionRows = optionsContainer.querySelectorAll('.preset-option-row');
  const options = [];
  
  optionRows.forEach((row, idx) => {
    const textInput = row.querySelector('.preset-option-text');
    if (textInput && textInput.value.trim()) {
      options.push({
        id: String(idx + 1).padStart(3, '0'),
        text: textInput.value.trim()
      });
    }
  });
  
  return options;
}

// Add a new option row to the form
function addOptionRow(text = '') {
  const container = document.getElementById('preset-options-list');
  if (!container) return;
  
  const row = document.createElement('div');
  row.className = 'preset-option-row';
  
  const optionNum = container.children.length + 1;
  const optionId = String(optionNum).padStart(3, '0');
  
  row.innerHTML = `
    <span class="preset-option-id">${optionId}</span>
    <input type="text" class="preset-option-text" placeholder="Option description..." value="${text}">
    <button type="button" class="preset-option-delete" title="Remove option">×</button>
  `;
  
  // Add delete handler
  const deleteBtn = row.querySelector('.preset-option-delete');
  deleteBtn.addEventListener('click', () => {
    row.remove();
    renumberOptionRows();
  });
  
  container.appendChild(row);
}

// Renumber option rows after deletion
function renumberOptionRows() {
  const container = document.getElementById('preset-options-list');
  if (!container) return;
  
  const rows = container.querySelectorAll('.preset-option-row');
  rows.forEach((row, idx) => {
    const idSpan = row.querySelector('.preset-option-id');
    if (idSpan) {
      idSpan.textContent = String(idx + 1).padStart(3, '0');
    }
  });
}

// Toggle options section visibility
function toggleOptionsSection() {
  const content = document.getElementById('preset-options-section-content');
  const arrow = document.getElementById('preset-options-arrow');
  if (!content) return;
  
  const isExpanded = content.style.display !== 'none';
  content.style.display = isExpanded ? 'none' : 'block';
  if (arrow) arrow.classList.toggle('expanded', !isExpanded);
}

// Initialize options section in preset builder
function initOptionsSection(preset = null) {
  const container = document.getElementById('preset-options-list');
  const toggle = document.getElementById('preset-randomize-toggle');
  
  if (!container) return;
  
  // Clear existing
  container.innerHTML = '';
  
  if (preset && preset.options && preset.options.length > 0) {
    // Populate with existing options
    preset.options.forEach(opt => {
      addOptionRow(opt.text);
    });
    // Set randomize toggle (default true for presets with options)
    if (toggle) toggle.checked = preset.randomizeOptions ?? true;
  } else {
    // New preset - default to checked (true) per requirements
    if (toggle) toggle.checked = true;
  }
}

// Edit preset in builder
function editPresetInBuilder(index) {
  const preset = CAMERA_PRESETS[index];
  
  // Show the submenu first
  showPresetBuilderSubmenu();
  
  // Set the editing index AFTER showing (which clears the form)
  editingPresetBuilderIndex = index;
  
 // Use setTimeout to ensure DOM is ready before populating
  setTimeout(() => {
    const nameInput = document.getElementById('preset-builder-name');
    const categoryInput = document.getElementById('preset-builder-category');
    const promptTextarea = document.getElementById('preset-builder-prompt');
    const templateSelect = document.getElementById('preset-builder-template');
    const deleteButton = document.getElementById('preset-builder-delete');
    const clearButton = document.getElementById('preset-builder-clear');
    
    if (nameInput) nameInput.value = preset.name;
    if (categoryInput) categoryInput.value = preset.category ? preset.category.join(', ') : '';
    if (promptTextarea) promptTextarea.value = preset.message;
    if (templateSelect) templateSelect.value = '';
    
    // Show delete button and hide clear button when editing existing preset
    if (deleteButton) {
      deleteButton.style.display = 'flex';
    }
    if (clearButton) {
      clearButton.style.display = 'none';
    }
    
    // Initialize options section with preset data
    initOptionsSection(preset);
  }, 100);
}

// Handle template selection
function handleTemplateSelection() {
  const templateSelect = document.getElementById('preset-builder-template');
  const promptTextarea = document.getElementById('preset-builder-prompt');
  const selectedTemplate = templateSelect.value;
  
  if (selectedTemplate && PRESET_TEMPLATES[selectedTemplate] !== undefined) {
    promptTextarea.value = PRESET_TEMPLATES[selectedTemplate];
  }
}

// Get all unique categories from existing presets
function getAllCategories() {
  const categoriesSet = new Set();
  CAMERA_PRESETS.forEach(preset => {
    if (preset.category && Array.isArray(preset.category)) {
      preset.category.forEach(cat => {
        categoriesSet.add(cat.toUpperCase());
      });
    }
  });
  return Array.from(categoriesSet).sort();
}

// Save custom preset
async function saveCustomPreset() {
  const name = document.getElementById('preset-builder-name').value.trim();
  const categoryInput = document.getElementById('preset-builder-category').value.trim();
  const prompt = document.getElementById('preset-builder-prompt').value.trim();
  
  // Validation
  if (!name) {
    alert('Please enter a preset name');
    return;
  }
  
  if (!prompt) {
    alert('Please enter a prompt');
    return;
  }
  
// Parse categories
  const categories = categoryInput 
    ? categoryInput.split(',').map(cat => cat.trim().toUpperCase()).filter(cat => cat.length > 0)
    : ['CUSTOM'];
  
  // Get options from the form
  const options = getOptionsFromForm();
  const randomizeOptions = document.getElementById('preset-randomize-toggle')?.checked ?? (options.length > 0);
  
  // Check if we're editing an existing preset
  if (editingPresetBuilderIndex >= 0) {
    // Editing mode
    const oldName = CAMERA_PRESETS[editingPresetBuilderIndex].name;
    CAMERA_PRESETS[editingPresetBuilderIndex] = {
      name: name.toUpperCase(),
      category: categories,
      message: prompt,
      options: options,
      randomizeOptions: randomizeOptions,
      internal: false
    };
    
    // If name changed, update visiblePresets array
    if (oldName !== name.toUpperCase()) {
      const visIndex = visiblePresets.indexOf(oldName);
      if (visIndex > -1) {
        visiblePresets[visIndex] = name.toUpperCase();
      }
    }
  } else {
    // Creating new preset - check if name already exists
    const existingIndex = CAMERA_PRESETS.findIndex(p => p.name.toUpperCase() === name.toUpperCase());
    if (existingIndex !== -1) {
      if (!await confirm(`A preset named "${name}" already exists. Do you want to overwrite it?`)) {
        return;
      }
      // Remove the existing preset
      CAMERA_PRESETS.splice(existingIndex, 1);
    }
    
    // Create new preset object
    const newPreset = {
      name: name.toUpperCase(),
      category: categories,
      message: prompt,
      options: options,
      randomizeOptions: randomizeOptions,
      internal: false
    };
    
    // Add to presets array
    CAMERA_PRESETS.push(newPreset);
    
    // Add to visible presets (always make new presets visible by default)
    if (!visiblePresets.includes(newPreset.name)) {
      visiblePresets.push(newPreset.name);
    }
  }
  
  // Save visible presets first
  saveVisiblePresets();
  
  // Save custom preset to IndexedDB
  if (editingPresetBuilderIndex >= 0) {
    // Editing existing custom preset
    const preset = CAMERA_PRESETS[editingPresetBuilderIndex];
    await presetStorage.saveNewPreset(preset);
  } else {
    // New custom preset
    const newPreset = CAMERA_PRESETS[CAMERA_PRESETS.length - 1]; // Just added
    await presetStorage.saveNewPreset(newPreset);
  }
  
  // Show success message
  alert(editingPresetBuilderIndex >= 0 ? `Preset "${name}" updated!` : `Preset "${name}" saved successfully!`);
  
  // Clear form and go back
  clearPresetBuilderForm();
  hidePresetBuilderSubmenu();
  
  // Refresh menu if it's open
  if (isMenuOpen) {
    populateStylesList();
  }
}

// Delete custom preset from builder
async function deleteCustomPreset() {
  if (editingPresetBuilderIndex < 0) {
    alert('No preset selected for deletion');
    return;
  }
  
  const preset = CAMERA_PRESETS[editingPresetBuilderIndex];
  
  // Verify this is a user-created preset
  if (preset.internal !== false) {
    alert('Cannot delete built-in presets');
    return;
  }
  
  if (!await confirm(`Delete preset "${preset.name}"? This cannot be undone.`)) {
    return;
  }
  
  // Remove from CAMERA_PRESETS
  CAMERA_PRESETS.splice(editingPresetBuilderIndex, 1);
  
  // Remove from visible presets
  const visIndex = visiblePresets.indexOf(preset.name);
  if (visIndex > -1) {
    visiblePresets.splice(visIndex, 1);
    saveVisiblePresets();
  }
  
  // Check if we deleted the currently active preset
  const wasCurrentPreset = (editingPresetBuilderIndex === currentPresetIndex);
  
  // Adjust current preset index if needed
  if (currentPresetIndex >= CAMERA_PRESETS.length) {
    currentPresetIndex = CAMERA_PRESETS.length - 1;
  }
  
  // If we deleted the current preset, switch to first visible preset
  if (wasCurrentPreset) {
    const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
    if (visiblePresetObjects.length > 0) {
      currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
    } else if (CAMERA_PRESETS.length > 0) {
      // No visible presets, just use first available
      currentPresetIndex = 0;
    }
    // Update the camera footer immediately
    updatePresetDisplay();
  }
  
  // Remove from IndexedDB
  const transaction = presetStorage.db.transaction(['presets'], 'readwrite');
  const store = transaction.objectStore('presets');
  await store.delete(`new_${preset.name}`);
  
  // Also remove from old localStorage (legacy)
  saveStyles();
  
  // Update visible presets display to reflect deletion
  updateVisiblePresetsDisplay();
  
  alert(`Preset "${preset.name}" deleted successfully!`);
  
  // Clear form and go back
  clearPresetBuilderForm();
  hidePresetBuilderSubmenu();
  
  // Refresh menu if open
  if (isMenuOpen) {
    populateStylesList();
  }
}

function populateVisiblePresetsList() {
  const list = document.getElementById('visible-presets-list');
  
  // Save current scroll position from the scroll container (like favorites does)
  const scrollContainer = document.querySelector('#visible-presets-submenu .submenu-list');
  const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
  
  list.innerHTML = '';
  
  // Only show presets that were explicitly imported or are user-created custom presets
// Do NOT show factory presets from JSON that weren't imported
const importedPresetNames = new Set(presetImporter.getImportedPresets().map(p => p.name));
const allPresets = CAMERA_PRESETS.filter(p => {
  if (p.internal) return false;  // Never show internal presets
  
  // Show if: explicitly imported OR user-created custom preset
  const isImported = importedPresetNames.has(p.name);
  const isCustom = !factoryPresets.some(fp => fp.name === p.name);
  
  return isImported || isCustom;
});
  const filtered = allPresets.filter(preset => {
    // First apply text search filter
    if (visiblePresetsFilterText) {
      const searchText = visiblePresetsFilterText.toLowerCase();
      const categoryMatch = preset.category && preset.category.some(cat => cat.toLowerCase().includes(searchText));
      const textMatch = preset.name.toLowerCase().includes(searchText) || categoryMatch;
      if (!textMatch) return false;
    }
    
    // Then apply category filter if active (filter by single category)
    if (visiblePresetsFilterByCategory) {
      return preset.category && preset.category.includes(visiblePresetsFilterByCategory);
    }
    
    return true;
  });
  
  const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  const fragment = document.createDocumentFragment();
  
  sorted.forEach(preset => {
    const item = document.createElement('div');
    item.className = 'style-item';
    item.dataset.presetName = preset.name;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'master-prompt-checkbox';
    checkbox.checked = visiblePresets.includes(preset.name);
    checkbox.style.marginRight = '3vw';
    
    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = preset.name;
    
    item.appendChild(checkbox);
    item.appendChild(name);
    
    checkbox.onclick = (e) => {
      e.stopPropagation();
      toggleVisiblePreset(preset.name, checkbox.checked);
    };
    
    item.onclick = () => {
      checkbox.checked = !checkbox.checked;
      toggleVisiblePreset(preset.name, checkbox.checked);
    };
    
    fragment.appendChild(item);
  });
  
  list.appendChild(fragment);
  
  const countElement = document.getElementById('visible-presets-count');
  if (countElement) {
    const visibleCount = sorted.filter(p => visiblePresets.includes(p.name)).length;
    countElement.textContent = visibleCount;
  }
  
// Update selection after render
  setTimeout(() => {
    updateVisiblePresetsSelection();
  }, 50);
}

function toggleVisiblePreset(presetName, isVisible) {
  const index = visiblePresets.indexOf(presetName);
  
  if (isVisible && index === -1) {
    visiblePresets.push(presetName);
  } else if (!isVisible && index > -1) {
    visiblePresets.splice(index, 1);
  }
  
  saveVisiblePresets();
  updateVisiblePresetsDisplay();
  
  // Check if the currently active preset was just made invisible
  const currentPreset = CAMERA_PRESETS[currentPresetIndex];
  if (currentPreset && !isVisible && currentPreset.name === presetName) {
    // Current preset was made invisible - switch to first visible preset
    const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
    if (visiblePresetObjects.length > 0) {
      // Find index of first visible preset in CAMERA_PRESETS
      currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
      // Update the camera footer immediately
      updatePresetDisplay();
    }
  }
  
// Save scroll position before repopulating (like favorites does)
  const scrollContainer = document.querySelector('#visible-presets-submenu .submenu-list');
  const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
  
  populateVisiblePresetsList(); // Update the current submenu list
  
  // Restore scroll position after repopulating - use requestAnimationFrame to ensure DOM is updated
  if (scrollContainer) {
    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollPosition;
    });
  }
  
  // Always update main menu count (even if not open)
  const stylesCountElement = document.getElementById('styles-count');
  if (stylesCountElement) {
    const { favorites, regular } = getStylesLists();
    const totalVisible = favorites.length + regular.length;
    stylesCountElement.textContent = totalVisible;
  }
  
  // Refresh main menu if open
  if (isMenuOpen) {
    populateStylesList();
  }
}

function updateVisiblePresetsDisplay() {
  const display = document.getElementById('current-visible-presets-display');
  if (display) {
    const total = CAMERA_PRESETS.filter(p => !p.internal).length;
    const visible = visiblePresets.length;
    display.textContent = visible === total ? 'All Visible' : `${visible} of ${total}`;
  }
}

function scrollVisiblePresetsUp() {
  if (!isVisiblePresetsSubmenuOpen || !visiblePresetsScrollEnabled) return;
  
  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentVisiblePresetsIndex = Math.max(0, currentVisiblePresetsIndex - 1);
  updateVisiblePresetsSelection();
}

function scrollVisiblePresetsDown() {
  if (!isVisiblePresetsSubmenuOpen || !visiblePresetsScrollEnabled) return;
  
  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  currentVisiblePresetsIndex = Math.min(items.length - 1, currentVisiblePresetsIndex + 1);
  updateVisiblePresetsSelection();
}

function updateVisiblePresetsSelection() {
  if (!isVisiblePresetsSubmenuOpen) return;

  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0) return;

  items.forEach(item => {
    item.classList.remove('menu-selected');
  });

  currentVisiblePresetsIndex = Math.max(0, Math.min(currentVisiblePresetsIndex, items.length - 1));

  const currentItem = items[currentVisiblePresetsIndex];
  if (currentItem) {
    currentItem.classList.add('menu-selected');
    
    currentItem.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
    
    // Show category hint with individually clickable categories
    const presetName = currentItem.dataset.presetName;
    const preset = CAMERA_PRESETS.find(p => p.name === presetName);
    const categoryHint = document.getElementById('visible-presets-category-hint');
    if (categoryHint && preset && preset.category && !isVisiblePresetsFilterFocused) {
      // Clear previous content
      categoryHint.innerHTML = '';
      categoryHint.style.display = 'block';
      
      // Create a clickable span for each category
      preset.category.forEach((cat, index) => {
        const categorySpan = document.createElement('span');
        categorySpan.textContent = cat;
        categorySpan.style.cursor = 'pointer';
        categorySpan.style.padding = '0 2px';
        
        // Highlight if this category is currently being filtered
        if (visiblePresetsFilterByCategory === cat) {
          categorySpan.style.textDecoration = 'underline';
          categorySpan.style.fontWeight = 'bold';
        }
        
        // Make each category clickable
        categorySpan.onclick = (e) => {
          e.stopPropagation();
          // If already filtering by this category, clear the filter
          if (visiblePresetsFilterByCategory === cat) {
            visiblePresetsFilterByCategory = '';
          } else {
            // Filter by this category
            visiblePresetsFilterByCategory = cat;
          }
          currentVisiblePresetsIndex = 0;
          populateVisiblePresetsList();
        };
        
        categoryHint.appendChild(categorySpan);
        
        // Add comma separator if not the last category
        if (index < preset.category.length - 1) {
          const comma = document.createElement('span');
          comma.textContent = ', ';
          categoryHint.appendChild(comma);
        }
      });
    } else if (categoryHint) {
      categoryHint.style.display = 'none';
    }
  }
}

function selectCurrentVisiblePresetsItem() {
  if (!isVisiblePresetsSubmenuOpen || !visiblePresetsScrollEnabled) return;

  const visiblePresetsList = document.getElementById('visible-presets-list');
  if (!visiblePresetsList) return;

  const items = visiblePresetsList.querySelectorAll('.style-item');
  if (items.length === 0 || currentVisiblePresetsIndex >= items.length) return;

  const currentItem = items[currentVisiblePresetsIndex];
  if (currentItem) {
    currentItem.click();
  }
}

function updateMotionDisplay() {
  const sensitivityLabels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
  const currentMotionDisplay = document.getElementById('current-motion-display');
  if (currentMotionDisplay) {
    const sensitivityLevel = Math.floor((50 - motionThreshold) / 10) + 1;
    const clampedLevel = Math.max(1, Math.min(5, sensitivityLevel));
    currentMotionDisplay.textContent = `Sensitivity: ${sensitivityLabels[clampedLevel - 1]}`;
  }
}

function saveMotionSettings() {
  const settings = {
    motionThreshold,
    motionPixelThreshold,
    motionContinuousEnabled,
    motionCooldown,
    motionStartDelay
  };
  try {
    localStorage.setItem(MOTION_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save motion settings:', err);
  }
}

function loadMotionSettings() {
  try {
    const saved = localStorage.getItem(MOTION_SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      motionThreshold = settings.motionThreshold || 30;
      motionPixelThreshold = settings.motionPixelThreshold || 0.1;
      motionContinuousEnabled = settings.motionContinuousEnabled !== undefined ? settings.motionContinuousEnabled : true;
      motionCooldown = settings.motionCooldown || 2;
      motionStartDelay = settings.motionStartDelay || 3;
    }
    
    // Update UI elements
    {
    const sensitivitySlider = document.getElementById('motion-sensitivity-slider');
    if (sensitivitySlider) {
      const sliderValue = Math.floor((50 - motionThreshold) / 10) + 1;
      sensitivitySlider.value = Math.max(1, Math.min(5, sliderValue));
    }
    
    const continuousCheckbox = document.getElementById('motion-continuous-enabled');
    if (continuousCheckbox) {
      continuousCheckbox.checked = motionContinuousEnabled;
    }
      
      const cooldownSlider = document.getElementById('motion-cooldown-slider');
      if (cooldownSlider) {
        cooldownSlider.value = motionCooldown;
      }

      const startDelaySlider = document.getElementById('motion-start-delay-slider');
      const startDelayValue = document.getElementById('motion-start-delay-value');
      if (startDelaySlider && startDelayValue) {
        const sliderValue = getStartDelaySliderValue();
        startDelaySlider.value = sliderValue;
        startDelayValue.textContent = MOTION_START_DELAYS[sliderValue].label;
      }      

      updateMotionDisplay();
    }
  } catch (err) {
    console.error('Failed to load motion settings:', err);
  }
}

function toggleNoMagicMode() {
  noMagicMode = !noMagicMode;
  
  const statusElement = document.getElementById('no-magic-status');
  if (statusElement) {
    statusElement.textContent = noMagicMode ? 'Enabled' : 'Disabled';
    statusElement.style.color = noMagicMode ? '#4CAF50' : '';
    statusElement.style.fontWeight = noMagicMode ? '600' : '';
  }
  
  try {
    localStorage.setItem(NO_MAGIC_MODE_KEY, JSON.stringify(noMagicMode));
  } catch (err) {
    console.error('Failed to save No Magic mode:', err);
  }
  
  // Update the camera footer immediately
  updateNoMagicFooter();
  
  if (noMagicMode) {
    showStatus('No Magic Mode ON - Camera only', 2000);
  } else {
    showStatus('No Magic Mode OFF - AI prompts enabled', 2000);
  }
}

function loadNoMagicMode() {
  try {
    const saved = localStorage.getItem(NO_MAGIC_MODE_KEY);
    if (saved !== null) {
      noMagicMode = JSON.parse(saved);
      
      const statusElement = document.getElementById('no-magic-status');
      if (statusElement) {
        statusElement.textContent = noMagicMode ? 'Enabled' : 'Disabled';
        statusElement.style.color = noMagicMode ? '#4CAF50' : '';
        statusElement.style.fontWeight = noMagicMode ? '600' : '';
      }
      
      // Update the camera footer on startup if NO MAGIC is active
      updateNoMagicFooter();
    }
  } catch (err) {
    console.error('Failed to load No Magic mode:', err);
  }
}

function updateNoMagicFooter() {
  if (!window.cameraStarted) return;
  
  if (noMagicMode) {
    if (statusElement) {
      statusElement.textContent = '⚡ NO MAGIC MODE';
    }
  } else {
    updatePresetDisplay();
  }
}

// Load import resolution setting
function loadImportResolution() {
  const saved = localStorage.getItem(IMPORT_RESOLUTION_STORAGE_KEY);
  if (saved !== null) {
    currentImportResolutionIndex = parseInt(saved, 10);
  }
  updateImportResolutionDisplay();
}

// Save import resolution setting
function saveImportResolution() {
  localStorage.setItem(IMPORT_RESOLUTION_STORAGE_KEY, currentImportResolutionIndex.toString());
  updateImportResolutionDisplay();
}

// Update import resolution display
function updateImportResolutionDisplay() {
  const display = document.getElementById('current-import-resolution-display');
  if (display) {
    const res = IMPORT_RESOLUTION_OPTIONS[currentImportResolutionIndex];
    display.textContent = res.name.split(' ')[0];
  }
}

// ===================================
// Tutorial Module Loader (Lazy Loading)
// ===================================

/**
 * Load the tutorial module lazily with a loading indicator
 * @returns {Promise<Object>} The tutorial module
 */
async function loadTutorialModule() {
  if (!tutorialModule) {
    // Show loading indicator
    showLoadingSpinner();
    try {
      tutorialModule = await import('./features/tutorial.js');
      // Initialize with callbacks to sync state
      tutorialModule.initTutorial({
        showSettingsSubmenu: showSettingsSubmenu,
        setIsMenuOpen: (val) => { isMenuOpen = val; },
        setIsSettingsSubmenuOpen: (val) => { isSettingsSubmenuOpen = val; }
      });
    } catch (error) {
      console.error('Failed to load tutorial module:', error);
      hideLoadingSpinner();
      alert('Failed to load tutorial. Please try again.');
      return null;
    }
    hideLoadingSpinner();
  }
  return tutorialModule;
}

/**
 * Open tutorial - loads module lazily
 */
async function openTutorialLazy() {
  const module = await loadTutorialModule();
  if (module) {
    module.openTutorial();
    // Sync state from module for key handlers
    isTutorialOpen = module.isTutorialOpenState();
    isTutorialSubmenuOpen = module.isTutorialSubmenuOpenState();
  }
}

// Loading spinner functions
let loadingSpinnerElement = null;

function showLoadingSpinner() {
  if (!loadingSpinnerElement) {
    loadingSpinnerElement = document.createElement('div');
    loadingSpinnerElement.id = 'loading-overlay';
    loadingSpinnerElement.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading...</div>
    `;
    loadingSpinnerElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    // Add spinner CSS
    const style = document.createElement('style');
    style.textContent = `
      .loading-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .loading-text {
        color: white;
        margin-top: 12px;
        font-size: 16px;
      }
    `;
    document.head.appendChild(style);
  }
  document.body.appendChild(loadingSpinnerElement);
}

function hideLoadingSpinner() {
  if (loadingSpinnerElement && loadingSpinnerElement.parentNode) {
    loadingSpinnerElement.parentNode.removeChild(loadingSpinnerElement);
  }
}

// Tutorial scroll functions that use the lazy-loaded module
async function scrollTutorialUpLazy() {
  if (tutorialModule) {
    tutorialModule.scrollTutorialUp();
    // Sync state
    if (tutorialModule.isTutorialOpenState) isTutorialOpen = tutorialModule.isTutorialOpenState();
    if (tutorialModule.isTutorialSubmenuOpenState) isTutorialSubmenuOpen = tutorialModule.isTutorialSubmenuOpenState();
  }
}

async function scrollTutorialDownLazy() {
  if (tutorialModule) {
    tutorialModule.scrollTutorialDown();
    // Sync state
    if (tutorialModule.isTutorialOpenState) isTutorialOpen = tutorialModule.isTutorialOpenState();
    if (tutorialModule.isTutorialSubmenuOpenState) isTutorialSubmenuOpen = tutorialModule.isTutorialSubmenuOpenState();
  }
}

async function selectCurrentTutorialItemLazy() {
  if (tutorialModule) {
    tutorialModule.selectCurrentTutorialItem();
  }
}

// ===================================
// End Tutorial Module Loader
// ===================================

// Show import resolution submenu
function showImportResolutionSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  const submenu = document.getElementById('import-resolution-submenu');
  const list = document.getElementById('import-resolution-list');
  
  list.innerHTML = '';
  IMPORT_RESOLUTION_OPTIONS.forEach((res, index) => {
    const item = document.createElement('div');
    item.className = 'resolution-item';
    if (index === currentImportResolutionIndex) {
      item.classList.add('selected');
    }
    item.textContent = res.name;
    item.onclick = () => {
      currentImportResolutionIndex = index;
      saveImportResolution();
      hideImportResolutionSubmenu();
    };
    list.appendChild(item);
  });
  
  submenu.style.display = 'flex';
  isImportResolutionSubmenuOpen = true;
  currentImportResolutionIndex_Menu = 0;
}

// Hide import resolution submenu
function hideImportResolutionSubmenu() {
  document.getElementById('import-resolution-submenu').style.display = 'none';
  document.getElementById('settings-submenu').style.display = 'flex';
  isImportResolutionSubmenuOpen = false;
}

function startMotionDetection() {
  if (!video || !canvas) return;
  
  lastFrameData = null;
  isMotionCooldownActive = false;
  
  motionDetectionInterval = setInterval(() => {
    if (!isMotionDetectionMode) {
      return;
    }
    
    // Skip if in cooldown or if captured image is showing (and continuous mode is off)
    if (isMotionCooldownActive) {
      return;
    }
    
    if (!motionContinuousEnabled && capturedImage.style.display === 'block') {
      return;
    }
    
    const motionDetected = detectMotion();
    if (motionDetected) {
      console.log('Motion detected! Capturing...');
      capturePhoto();
      
      // Start cooldown period
      isMotionCooldownActive = true;
      setTimeout(() => {
        isMotionCooldownActive = false;
        lastFrameData = null; // Reset frame comparison after cooldown
        
        // Auto-return to camera view after cooldown
        if (capturedImage.style.display === 'block') {
          capturedImage.style.display = 'none';
          video.style.display = 'block';
        }
        
        // If continuous mode is OFF, stop motion detection after one capture
        if (!motionContinuousEnabled) {
          stopMotionDetection();
          isMotionDetectionMode = false;
          const btn = document.getElementById('motion-toggle');
          btn.classList.remove('active');
          btn.title = 'Motion Detection: OFF';
          showStatus('Motion capture complete - Press eye button to reactivate', 3000);
          // Show current preset when motion detection auto-stops
          if (CAMERA_PRESETS && CAMERA_PRESETS[currentPresetIndex]) {
            showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
          }
        }
      }, motionCooldown * 1000);
    }
  }, 500); // Check every 500ms
}

function stopMotionDetection() {
  if (motionDetectionInterval) {
    clearInterval(motionDetectionInterval);
    motionDetectionInterval = null;
  }
  lastFrameData = null;
}

function detectMotion() {
  if (!video || !canvas) return false;
  
  const context = canvas.getContext('2d');
  const width = 320; // Use smaller size for performance
  const height = 240;
  
  canvas.width = width;
  canvas.height = height;
  context.drawImage(video, 0, 0, width, height);
  
  const currentFrame = context.getImageData(0, 0, width, height);
  
  if (!lastFrameData) {
    lastFrameData = currentFrame;
    return false;
  }
  
  let diffPixels = 0;
  const totalPixels = width * height;
  
  for (let i = 0; i < currentFrame.data.length; i += 4) {
    const rDiff = Math.abs(currentFrame.data[i] - lastFrameData.data[i]);
    const gDiff = Math.abs(currentFrame.data[i + 1] - lastFrameData.data[i + 1]);
    const bDiff = Math.abs(currentFrame.data[i + 2] - lastFrameData.data[i + 2]);
    
    const avgDiff = (rDiff + gDiff + bDiff) / 3;
    
    if (avgDiff > motionThreshold) {
      diffPixels++;
    }
  }
  
  lastFrameData = currentFrame;
  
  const changePercentage = diffPixels / totalPixels;
  return changePercentage > motionPixelThreshold;
}

// Toggle random mode
function toggleRandomMode() {
  isRandomMode = !isRandomMode;
  
  const randomToggle = document.getElementById('random-toggle');
  if (isRandomMode) {
    randomToggle.classList.add('random-active');
    statusElement.textContent = noMagicMode
      ? `⚡ NO MAGIC MODE • 🎲 Random Mode`
      : `Random mode ON • ${CAMERA_PRESETS[currentPresetIndex].name}`;
    showStyleReveal('🎲 Random Mode');
  } else {
    randomToggle.classList.remove('random-active');
    updatePresetDisplay();
    // Show current preset when random mode is turned off
    if (CAMERA_PRESETS && CAMERA_PRESETS[currentPresetIndex]) {
      showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
    }
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'random_mode_toggled',
      enabled: isRandomMode,
      timestamp: Date.now() 
    }));
  }
}

// Load queued photos from localStorage
function loadQueue() {
  try {
    const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (saved) {
      photoQueue = JSON.parse(saved);
    }
  } catch (err) {
    console.error('Error loading queue:', err);
    photoQueue = [];
  }
}

// Save queue to localStorage
function saveQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(photoQueue));
  } catch (err) {
    console.error('Error saving queue:', err);
  }
}

// Update connection status display
function updateConnectionStatus() {
  if (connectionStatusElement) {
    if (isOnline) {
      connectionStatusElement.className = 'connection-status online';
      connectionStatusElement.querySelector('#connection-text').textContent = 'Online';
    } else {
      connectionStatusElement.className = 'connection-status offline';
      connectionStatusElement.querySelector('#connection-text').textContent = 'Offline';
    }
    // connectionStatusElement.style.display = 'block'; // not auto-showing only shown on init
  }
  
  updateQueueDisplay();
}

// Update queue count display
function updateQueueDisplay() {
  if (queueStatusElement) {
    const count = photoQueue.length;
    queueStatusElement.querySelector('#queue-count').textContent = count;
    queueStatusElement.style.display = count > 0 ? 'block' : 'none';
  }
  
  if (syncButton) {
    const count = photoQueue.length;
    syncButton.querySelector('#sync-count').textContent = count;
    syncButton.style.display = count > 0 && isOnline ? 'block' : 'none';
  }
}

// Setup connection monitoring
function setupConnectionMonitoring() {
  window.addEventListener('online', () => {
    isOnline = true;
    updateConnectionStatus();
    console.log('Connection restored');
    
    if (photoQueue.length > 0 && !isSyncing) {
      setTimeout(() => {
        statusElement.textContent = `Connection restored! Syncing ${photoQueue.length} photos...`;
        syncQueuedPhotos();
      }, 1000);
    }
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatus();
    console.log('Connection lost');
    
    if (isSyncing) {
      statusElement.textContent = 'Connection lost during sync';
    }
  });
  
  updateConnectionStatus();
}

// Enumerate available cameras
async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(device => device.kind === 'videoinput');
    console.log('Available cameras:', availableCameras.length);
    return availableCameras;
  } catch (err) {
    console.error('Error enumerating cameras:', err);
    return [];
  }
}

// Get camera constraints for current camera
function getCameraConstraints() {
  const resolution = RESOLUTION_PRESETS[currentResolutionIndex];
  
  if (availableCameras.length === 0) {
    return {
      video: {
        facingMode: 'environment',
        width: { exact: resolution.width },
        height: { exact: resolution.height },
        frameRate: { ideal: 30, max: 30 }
      }
    };
  }

  const currentCamera = availableCameras[currentCameraIndex];
  const constraints = {
    video: {
      deviceId: { exact: currentCamera.deviceId },
      width: { exact: resolution.width },
      height: { exact: resolution.height },
      frameRate: { ideal: 30, max: 30 }
    }
  };
  
  if (isFrontCamera()) {
    constraints.video.advanced = [{ zoom: 1.0 }];
  }
  
  return constraints;
}

// Change resolution and restart camera
async function changeResolution(newIndex) {
  if (newIndex === currentResolutionIndex || !stream) return;
  
  currentResolutionIndex = newIndex;
  saveResolution(newIndex);
  
  try {
    statusElement.textContent = 'Changing resolution...';
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    // Apply white balance
    // setTimeout(() => {
    //   applyWhiteBalance();
    // }, 100);
    
    await new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          applyVideoTransform();
          await applyZoom(currentZoom);
          setTimeout(resolve, 100);
        } catch (err) {
          console.error('Video play error:', err);
          resolve();
        }
      };
    });
    
    updatePresetDisplay();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        action: 'resolution_changed',
        resolution: RESOLUTION_PRESETS[currentResolutionIndex].name,
        timestamp: Date.now() 
      }));
    }
    
  } catch (err) {
    console.error('Resolution change error:', err);
    statusElement.textContent = 'Resolution change failed';
  }
}

// Get camera label for display
function getCurrentCameraLabel() {
  if (availableCameras.length === 0) return 'Default Camera';
  
  const currentCamera = availableCameras[currentCameraIndex];
  let label = currentCamera.label;
  
  if (!label || label === '') {
    if (currentCamera.deviceId) {
      label = `Camera ${currentCameraIndex + 1}`;
    } else {
      label = 'Unknown Camera';
    }
  } else {
    label = label.replace(/\([^)]*\)/g, '').trim();
    if (label.toLowerCase().includes('front')) {
      label = 'Front Camera';
    } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('rear')) {
      label = 'Back Camera';
    } else if (label.length > 20) {
      label = label.substring(0, 17) + '...';
    }
  }
  
  return label;
}

function isFrontCamera() {
  if (availableCameras.length === 0) return false;
  
  const currentCamera = availableCameras[currentCameraIndex];
  if (!currentCamera) return false;
  
  const label = currentCamera.label.toLowerCase();
  
  // Check facingMode first (most reliable)
  if (currentCamera.facingMode === 'user') return true;
  if (currentCamera.facingMode === 'environment') return false;
  
  // Check label for keywords
  // Front camera keywords
  if (label.includes('front') || label.includes('user') || label.includes('selfie') || label.includes('face')) {
    return true;
  }
  
  // Back camera keywords
  if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
    return false;
  }
  
  // For R1: camera index 0 is typically back, camera index 1 is typically front
  // This is a fallback when labels don't give us info
  if (availableCameras.length === 2) {
    return currentCameraIndex === 1;
  }
  
  // Last resort: assume first camera is back camera
  return currentCameraIndex > 0;
}

// Apply mirror transform to video
function applyVideoTransform() {
  try {
    const isFront = isFrontCamera();
    
    if (!isFront) {  // Changed: now mirror when NOT front camera
  video.style.transform = "scaleX(-1) translateZ(0)";
  video.style.webkitTransform = "scaleX(-1) translateZ(0)";
} else {
  video.style.transform = "translateZ(0)";
  video.style.webkitTransform = "translateZ(0)";
}
  } catch (err) {
    console.warn("Mirror transform skipped:", err);
  }
}

// Check if camera supports zoom
function supportsZoom() {
  if (!videoTrack) return false;
  const capabilities = videoTrack.getCapabilities();
  return capabilities && 'zoom' in capabilities;
}

// Get zoom constraints
function getZoomConstraints() {
  if (!videoTrack) return { min: 1, max: 5, step: 0.1 };
  const capabilities = videoTrack.getCapabilities();
  if (capabilities && capabilities.zoom) {
    return {
      min: Math.min(capabilities.zoom.min || 1, 1),
      max: Math.max(capabilities.zoom.max || 5, 5),
      step: capabilities.zoom.step || 0.1
    };
  }
  return { min: 1, max: 5, step: 0.1 };
}

// Apply zoom to video track
async function applyZoom(zoomLevel) {
  if (!videoTrack) return;
  
  try {
    if (supportsZoom()) {
      const constraints = getZoomConstraints();
      const clampedZoom = Math.max(constraints.min, Math.min(zoomLevel, constraints.max));
      
      const constraintsToApply = {
        advanced: [{ zoom: clampedZoom }]
      };
      
      const capabilities = videoTrack.getCapabilities();
      if (capabilities && capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        constraintsToApply.advanced[0].focusMode = 'continuous';
      }
      
      await videoTrack.applyConstraints(constraintsToApply);
      
      currentZoom = clampedZoom;
      
      // Apply mirror transform for front camera even with hardware zoom
      if (!isFrontCamera()) {
        video.style.transform = "scaleX(-1) translateZ(0)";
        video.style.webkitTransform = "scaleX(-1) translateZ(0)";
      } else {
        video.style.transform = "translateZ(0)";
        video.style.webkitTransform = "translateZ(0)";
      }
    } else {
      const clampedZoom = Math.max(1, Math.min(zoomLevel, 5));
      currentZoom = clampedZoom;
      
      if (!isFrontCamera()) {
        video.style.transform = `scaleX(-1) scale(${clampedZoom})`;
        video.style.webkitTransform = `scaleX(-1) scale(${clampedZoom})`;
      } else {
        video.style.transform = `scale(${clampedZoom})`;
        video.style.webkitTransform = `scale(${clampedZoom})`;
      }
    }
  } catch (err) {
    const clampedZoom = Math.max(1, Math.min(zoomLevel, 5));
    currentZoom = clampedZoom;
    
    if (!isFrontCamera()) {
      video.style.transform = `scaleX(-1) scale(${clampedZoom})`;
      video.style.webkitTransform = `scaleX(-1) scale(${clampedZoom})`;
    } else {
      video.style.transform = `scale(${clampedZoom})`;
      video.style.webkitTransform = `scale(${clampedZoom})`;
    }
  }
}

// Trigger manual focus (tap-to-focus simulation)
async function triggerFocus() {
  if (!videoTrack) return;
  
  try {
    const capabilities = videoTrack.getCapabilities();
    
    if (capabilities && capabilities.focusMode) {
      if (capabilities.focusMode.includes('single-shot')) {
        await videoTrack.applyConstraints({
          advanced: [{ 
            focusMode: 'single-shot',
            zoom: currentZoom 
          }]
        });
        console.log('Triggered single-shot focus');
        
        setTimeout(async () => {
          try {
            await videoTrack.applyConstraints({
              advanced: [{ 
                focusMode: 'continuous',
                zoom: currentZoom 
              }]
            });
          } catch (err) {
            console.log('Could not return to continuous focus:', err);
          }
        }, 500);
      } else if (capabilities.focusMode.includes('manual')) {
        await videoTrack.applyConstraints({
          advanced: [{ 
            focusMode: 'manual',
            zoom: currentZoom 
          }]
        });
        console.log('Triggered manual focus');
      }
    }
  } catch (err) {
    console.log('Focus adjustment not supported or failed:', err);
  }
}

// Reset zoom
async function resetZoom() {
  currentZoom = 1;
  await applyZoom(1);
}

// Switch to next camera
async function switchCamera() {
  if (isLoadingCamera || availableCameras.length <= 1) {
    console.log('Cannot switch camera: loading or not enough cameras');
    return;
  }
  
  isLoadingCamera = true;
  
  try {
    statusElement.textContent = 'Switching camera...';
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    console.log(`Switching to camera ${currentCameraIndex + 1} of ${availableCameras.length}`);
    
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    // Apply white balance
    // setTimeout(() => {
    //  applyWhiteBalance();
    // }, 100);
    
    await new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          applyVideoTransform();
          await applyZoom(currentZoom);
          setTimeout(resolve, 100);
        } catch (err) {
          console.error('Video play error:', err);
          resolve();
        }
      };
    });
    
    updatePresetDisplay();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        action: 'camera_switched',
        cameraIndex: currentCameraIndex,
        cameraLabel: getCurrentCameraLabel(),
        timestamp: Date.now() 
      }));
    }
    
  } catch (err) {
    console.error('Camera switch error:', err);
    statusElement.textContent = 'Camera switch failed';
    
    currentCameraIndex = (currentCameraIndex - 1 + availableCameras.length) % availableCameras.length;
  } finally {
    isLoadingCamera = false;
  }
}

// Load burst settings
function loadBurstSettings() {
  try {
    const saved = localStorage.getItem(BURST_SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      burstCount = settings.count || 5;
      const speedKey = settings.speed || 2;
      burstDelay = BURST_SPEEDS[speedKey].delay;
    }
  } catch (err) {
    console.error('Error loading burst settings:', err);
  }
}

// Save burst settings
function saveBurstSettings(count, speed) {
  try {
    localStorage.setItem(BURST_SETTINGS_KEY, JSON.stringify({
      count: count,
      speed: speed
    }));
  } catch (err) {
    console.error('Error saving burst settings:', err);
  }
}

// Toggle burst mode
function toggleBurstMode() {
  isBurstMode = !isBurstMode;
  
  const burstToggle = document.getElementById('burst-toggle');
  if (isBurstMode) {
    burstToggle.classList.add('burst-active');
    statusElement.textContent = noMagicMode
      ? `⚡ NO MAGIC MODE • 📸 Burst Mode`
      : `Burst mode ON (${burstCount} photos) • ${CAMERA_PRESETS[currentPresetIndex].name}`;
    showStyleReveal('📸 Burst Mode');
  } else {
    burstToggle.classList.remove('burst-active');
    updatePresetDisplay();
    // Show current preset when burst mode is turned off
    if (CAMERA_PRESETS && CAMERA_PRESETS[currentPresetIndex]) {
      showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
    }
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'burst_mode_toggled',
      enabled: isBurstMode,
      count: burstCount,
      timestamp: Date.now() 
    }));
  }
}

// Toggle timer mode
function toggleTimerMode() {
  isTimerMode = !isTimerMode;
  
  const timerToggle = document.getElementById('timer-toggle');
  if (isTimerMode) {
    timerToggle.classList.add('timer-active');
    statusElement.textContent = noMagicMode
      ? `⚡ NO MAGIC MODE • ⏱️ Timer Mode`
      : `Timer mode ON (${timerDelay}s delay) • ${CAMERA_PRESETS[currentPresetIndex].name}`;
    showStyleReveal('⏱️ Timer Mode');
  } else {
    timerToggle.classList.remove('timer-active');
    // Cancel any active timer
    if (timerCountdown) {
      clearInterval(timerCountdown);
      timerCountdown = null;
      document.getElementById('timer-countdown').style.display = 'none';
    }
    updatePresetDisplay();
    // Show current preset when timer mode is turned off
    if (CAMERA_PRESETS && CAMERA_PRESETS[currentPresetIndex]) {
      showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
    }
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'timer_mode_toggled',
      enabled: isTimerMode,
      delay: timerDelay,
      timestamp: Date.now() 
    }));
  }
}

// Start timer countdown
function startTimerCountdown(captureCallback) {
  let remainingSeconds = timerDelay;
  const countdownElement = document.getElementById('timer-countdown');
  const countdownText = document.getElementById('timer-countdown-text');
  
  // Show initial countdown
  countdownText.textContent = remainingSeconds;
  countdownElement.style.display = 'flex';
  countdownElement.classList.remove('countdown-fade-out');
  countdownElement.classList.add('countdown-fade-in');
  
  statusElement.textContent = `Timer: ${remainingSeconds}s...`;
  
  timerCountdown = setInterval(() => {
    remainingSeconds--;
    
    if (remainingSeconds > 0) {
      // Fade out current number
      countdownElement.classList.remove('countdown-fade-in');
      countdownElement.classList.add('countdown-fade-out');
      
      setTimeout(() => {
        // Update number and fade in
        countdownText.textContent = remainingSeconds;
        countdownElement.classList.remove('countdown-fade-out');
        countdownElement.classList.add('countdown-fade-in');
        statusElement.textContent = `Timer: ${remainingSeconds}s...`;
      }, 500);
      
    } else {
      // Timer finished - fade out and capture
      countdownElement.classList.remove('countdown-fade-in');
      countdownElement.classList.add('countdown-fade-out');
      
      setTimeout(() => {
        countdownElement.style.display = 'none';
        countdownElement.classList.remove('countdown-fade-out');
        clearInterval(timerCountdown);
        timerCountdown = null;
        
        // Execute the capture callback
        captureCallback();
        
        // In continuous mode, auto-return to camera and continue
        if (timerRepeatEnabled && isTimerMode) {
          // Auto-return to camera view after brief delay
          setTimeout(() => {
            if (capturedImage.style.display === 'block') {
              capturedImage.style.display = 'none';
              video.style.display = 'block';
              
              // Restore camera switch button if multiple cameras available
              const cameraButton = document.getElementById('camera-button');
              if (cameraButton && availableCameras.length > 1) {
                cameraButton.style.display = 'flex';
              }
            }
          }, 500);
          
          // Continue timer loop
          setTimeout(() => {
            if (isTimerMode) {
              startTimerCountdown(captureCallback);
            }
          }, timerRepeatInterval * 1000);
        }
      }, 500);
    }
  }, 1000);
}

// Cancel timer countdown
function cancelTimerCountdown() {
  if (timerCountdown) {
    clearInterval(timerCountdown);
    timerCountdown = null;
    document.getElementById('timer-countdown').style.display = 'none';
    updatePresetDisplay();
  }
}

// Load timer settings from localStorage
function loadTimerSettings() {
  try {
    const saved = localStorage.getItem(TIMER_SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      timerDelay = settings.delay || 10;
      timerRepeatEnabled = settings.repeat || false;
      timerRepeatInterval = settings.repeatInterval || 1;
    }
  } catch (err) {
    console.error('Error loading timer settings:', err);
  }
}

// Save timer settings to localStorage
function saveTimerSettings() {
  try {
    localStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify({
      delay: timerDelay,
      repeat: timerRepeatEnabled,
      repeatInterval: timerRepeatInterval // ADD THIS LINE
    }));
  } catch (err) {
    console.error('Error saving timer settings:', err);
  }
}

// Update timer display in settings menu
function updateTimerDisplay() {
  const display = document.getElementById('current-timer-display');
  if (display) {
    const repeatText = timerRepeatEnabled ? `Repeat (${TIMER_REPEAT_INTERVALS[getTimerRepeatIntervalKey()].label})` : 'No Repeat';
    display.textContent = `${timerDelay}s, ${repeatText}`;
  }
}

// Helper function to get current repeat interval key
function getTimerRepeatIntervalKey() {
  for (const [key, value] of Object.entries(TIMER_REPEAT_INTERVALS)) {
    if (value.seconds === timerRepeatInterval) {
      return parseInt(key);
    }
  }
  return 1; // Default to 1 second
}

// Burst mode capture
async function startBurstCapture() {
  if (!stream || isBursting || capturedImage.style.display === 'block') {
    return;
  }
  
  isBursting = true;
  
  statusElement.textContent = `Burst mode: Taking ${burstCount} photos...`;
  
  for (let i = 0; i < burstCount; i++) {
    statusElement.textContent = `Burst ${i + 1}/${burstCount}...`;
    
    captureBurstPhoto(i + 1);
    
    if (i < burstCount - 1) {
      await new Promise(resolve => setTimeout(resolve, burstDelay));
    }
  }
  
  isBursting = false;
  statusElement.textContent = `Burst complete! ${burstCount} photos saved.`;
  
  if (isOnline && !isSyncing) {
    setTimeout(() => {
      syncQueuedPhotos();
    }, 500);
  } else if (!isOnline) {
    statusElement.textContent = `Burst complete! ${burstCount} photos queued (offline).`;
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'burst_complete',
      count: burstCount,
      timestamp: Date.now() 
    }));
  }
  
  setTimeout(() => {
    if (isBurstMode) {
      statusElement.textContent = noMagicMode
        ? `⚡ NO MAGIC MODE • 📸 Burst Mode`
        : `Burst mode ON (${burstCount} photos) • ${CAMERA_PRESETS[currentPresetIndex].name}`;
    } else {
      updatePresetDisplay();
    }
  }, 2000);
}

function captureBurstPhoto(photoNumber) {
  if (!stream) return;
  
  if (isRandomMode) {
    currentPresetIndex = getRandomPresetIndex();
  }
  
  // Only resize if dimensions actually changed to save CPU
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  
  const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: false });
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const zoomedWidth = canvas.width / currentZoom;
  const zoomedHeight = canvas.height / currentZoom;
  const offsetX = (canvas.width - zoomedWidth) / 2;
  const offsetY = (canvas.height - zoomedHeight) / 2;
  
  // Since selfie camera (mis-identified as !isFrontCamera) shows mirrored preview,
  // we need to flip the capture back to normal orientation
  if (!isFrontCamera()) {
    // This is actually the SELFIE camera - capture needs double flip to un-mirror
    ctx.save();
    ctx.scale(-1, 1);
    
    ctx.drawImage(
      video,
      offsetX, offsetY, zoomedWidth, zoomedHeight,
      -canvas.width, 0, canvas.width, canvas.height
    );
    
    ctx.restore();
    
    // Now flip the canvas content back to un-mirror the final photo
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(canvas, -canvas.width, 0);
    
    // Copy back to main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
  } else {
    // This is the regular camera - keep as is
    ctx.drawImage(
      video,
      offsetX, offsetY, zoomedWidth, zoomedHeight,
      0, 0, canvas.width, canvas.height
    );
  }
  
  // Apply white balance adjustments to canvas pixels - COMMENTED OUT
  // applyWhiteBalanceToCanvas(ctx, canvas.width, canvas.height);
  
  // Use lower quality for higher resolutions to reduce file size
  const quality = currentResolutionIndex >= 2 ? 0.7 : 0.8;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const currentPreset = CAMERA_PRESETS[currentPresetIndex];
  
  // Add to gallery
  addToGallery(dataUrl);
  
  const queueItem = {
    id: Date.now().toString() + '-' + photoNumber,
    imageBase64: dataUrl,
    preset: currentPreset,
    timestamp: Date.now()
  };
  
  photoQueue.push(queueItem);
  saveQueue();
  updateQueueDisplay();
}

// Initialize camera
async function initCamera() {
  try {
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    capturedImage = document.getElementById('captured-image');
    statusElement = document.getElementById('status');
    resetButton = document.getElementById('reset-button');
    
    const startScreen = document.getElementById('start-screen');
    if (startScreen) {
      const startText = startScreen.querySelector('.start-text');
      if (startText) {
        startText.textContent = 'Requesting camera access...';
      }
      const startButton = document.getElementById('start-button');
      if (startButton) {
        startButton.disabled = true;
      }
    }
    
    await enumerateCameras();
    
    if (availableCameras.length > 1) {
      const backCameraIndex = availableCameras.findIndex(camera => {
        const label = camera.label.toLowerCase();
        return label.includes('back') || label.includes('rear') || label.includes('environment');
      });
      
      currentCameraIndex = backCameraIndex !== -1 ? backCameraIndex : availableCameras.length - 1;
    } else {
      currentCameraIndex = 0;
    }
    
    const constraints = getCameraConstraints();
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    video.srcObject = stream;
    videoTrack = stream.getVideoTracks()[0];
    // Apply white balance
    // setTimeout(() => {
    //  applyWhiteBalance();
    // }, 100);
    
    console.log('Camera initialized:', getCurrentCameraLabel());

    loadQueue();
    setupConnectionMonitoring();
    
    await new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          applyVideoTransform();
          applyZoom(1);
          setTimeout(resolve, 100);
        } catch (err) {
          console.error('Video play error:', err);
          resolve();
        }
      };
    });
    
    document.getElementById('start-screen').remove(); // Deletes from memory
    document.getElementById('camera-container').style.display = 'flex';
    statusElement.style.display = 'block';
    
    const cameraButton = document.getElementById('camera-button');
    if (availableCameras.length > 1) {
      cameraButton.style.display = 'flex';
    }
    
    const menuButton = document.getElementById('menu-button');
    if (menuButton) {
      menuButton.style.display = 'flex';
    }
    
    const modeCarousel = document.getElementById('mode-carousel');
    if (modeCarousel) {
      modeCarousel.style.display = 'block';
    }

    const galleryButton = document.getElementById('gallery-button');
    if (galleryButton) {
      galleryButton.style.display = 'flex';
    }

    updatePresetDisplay();
    
    // Show online indicator for 3 seconds
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus && isOnline) {
      connectionStatus.style.display = 'block';
      setTimeout(() => {
        connectionStatus.style.display = 'none';
      }, 3000);
    }
    
    // Show updates indicator for 3 seconds if updates are available
    if (window.hasPresetsUpdates) {
      const updatesIndicator = document.getElementById('updates-indicator');
      if (updatesIndicator) {
        updatesIndicator.style.display = 'block';
        setTimeout(() => {
          updatesIndicator.style.display = 'none';
        }, 3000);
      }
    }
    
    // Show master prompt indicator if enabled
    updateMasterPromptIndicator();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        status: 'camera_ready',
        availableCameras: availableCameras.length,
        currentCamera: getCurrentCameraLabel(),
        timestamp: Date.now() 
      }));
    }
  } catch (err) {
    console.error('Camera access error:', err);
    statusElement.textContent = 'Camera access denied';
    
    // RE-ENABLE THE START BUTTON SO USER CAN TRY AGAIN
    const startButton = document.getElementById('start-button');
    if (startButton) {
      startButton.disabled = false;
    }
    const startScreen = document.getElementById('start-screen');
    if (startScreen) {
      startScreen.style.display = 'block';
    }
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        status: 'camera_error',
        error: err.message,
        timestamp: Date.now() 
      }));
    }
  }
}

// Pause camera stream to reduce lag
function pauseCamera() {
  if (stream && video) {
    // Stop all tracks to actually disable the camera hardware
    stream.getTracks().forEach(track => {
      track.stop();
    });
    video.style.display = 'none';
    video.srcObject = null;
  }
}

// Resume camera stream
async function resumeCamera() {
  if (video) {
    try {
      // Restart the camera with the same constraints
      const constraints = getCameraConstraints();
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      video.srcObject = stream;
      videoTrack = stream.getVideoTracks()[0];
      // Apply white balance
      // setTimeout(() => {
      //  applyWhiteBalance();
      // }, 100);
      
      await new Promise((resolve) => {
        video.onloadedmetadata = async () => {
          try {
            await video.play();
            applyVideoTransform();
            await applyZoom(currentZoom);
            setTimeout(resolve, 100);
          } catch (err) {
            console.error('Video resume error:', err);
            resolve();
          }
        };
      });
      
      video.style.display = 'block';
            
    } catch (err) {
      console.error('Failed to resume camera:', err);
      statusElement.textContent = 'Camera resume failed';
    }
  }
}

// Capture photo and send to WebSocket
function capturePhoto() {
  if (!stream) return;
  
  if (isRandomMode) {
    currentPresetIndex = getRandomPresetIndex();
    showStyleReveal(CAMERA_PRESETS[currentPresetIndex].name);
  }
  
  // Only resize if dimensions actually changed to save CPU
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  
  const ctx = canvas.getContext('2d', { 
    willReadFrequently: false, 
    alpha: false,
    desynchronized: true
  });
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const zoomedWidth = canvas.width / currentZoom;
  const zoomedHeight = canvas.height / currentZoom;
  const offsetX = (canvas.width - zoomedWidth) / 2;
  const offsetY = (canvas.height - zoomedHeight) / 2;
  
  // Since selfie camera (mis-identified as !isFrontCamera) shows mirrored preview,
  // we need to flip the capture back to normal orientation
  if (!isFrontCamera()) {
    // This is actually the SELFIE camera - capture needs double flip to un-mirror
    ctx.save();
    ctx.scale(-1, 1);
    
    ctx.drawImage(
      video,
      offsetX, offsetY, zoomedWidth, zoomedHeight,
      -canvas.width, 0, canvas.width, canvas.height
    );
    
    ctx.restore();
    
    // Now flip the canvas content back to un-mirror the final photo
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(canvas, -canvas.width, 0);
    
    // Copy back to main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
  } else {
    // This is the regular camera - keep as is
    ctx.drawImage(
      video,
      offsetX, offsetY, zoomedWidth, zoomedHeight,
      0, 0, canvas.width, canvas.height
    );
  }
  
  // Apply white balance adjustments to canvas pixels
  // applyWhiteBalanceToCanvas(ctx, canvas.width, canvas.height);
  
  // Use lower quality for higher resolutions to reduce file size
  const quality = currentResolutionIndex >= 2 ? 0.7 : 0.8;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  capturedImage.src = dataUrl;
  capturedImage.style.display = 'block';
  capturedImage.style.transform = 'none';
  video.style.display = 'none';
  
    // Stop QR detection when photo is captured
  stopQRDetection();

  // Hide reset button when motion detection OR continuous timer is active
  if (isMotionDetectionMode || (isTimerMode && timerRepeatEnabled)) {
    resetButton.style.display = 'none';
  } else {
    resetButton.style.display = 'block';
  }
  // } else {
  //   resetButton.style.display = 'none';
  // }
  // above three lines may be wrong

  const cameraButton = document.getElementById('camera-button');
  if (cameraButton) {
    cameraButton.style.display = 'none';
  }
  
  const resolutionButton = document.getElementById('resolution-button');
  if (resolutionButton) {
    resolutionButton.style.display = 'none';
  }
  
  addToGallery(dataUrl);
  
  const currentPreset = CAMERA_PRESETS[currentPresetIndex];
  
  const queueItem = {
    id: Date.now().toString(),
    imageBase64: dataUrl,
    preset: currentPreset,
    timestamp: Date.now()
  };
  
  photoQueue.push(queueItem);
  saveQueue();
  updateQueueDisplay();
  
  if (isOnline) {
    const message = noMagicMode 
      ? 'Photo saved!'
      : 'Photo saved! Uploading...';
    statusElement.textContent = message;
    if (!isSyncing) {
      syncQueuedPhotos();
    }
  } else {
    statusElement.textContent = `Photo queued for sync (${photoQueue.length} in queue)`;
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'photo_captured',
      queued: true,
      queueLength: photoQueue.length,
      timestamp: Date.now() 
    }));
  }
}

async function syncQueuedPhotos() {
  if (photoQueue.length === 0 || isSyncing) {
    return;
  }
  
  if (!isOnline) {
    statusElement.textContent = 'Cannot sync - offline';
    return;
  }
  
  isSyncing = true;
  syncButton.disabled = true;
  syncButton.classList.add('syncing');
  
  console.log(`Syncing ${photoQueue.length} queued photos...`);
  
  const originalCount = photoQueue.length;
  let successCount = 0;
  
  while (photoQueue.length > 0 && isOnline) {
    const item = photoQueue[0];
    
    try {
      statusElement.textContent = `Syncing ${successCount + 1}/${originalCount}...`;
      
      if (typeof PluginMessageHandler !== 'undefined' && !noMagicMode) {
        PluginMessageHandler.postMessage(JSON.stringify({
          message: getFinalPrompt(item.preset.message, item.preset.name, item.preset),
          pluginId: 'com.r1.pixelart',
          imageBase64: item.imageBase64
        }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (isOnline) {
        photoQueue.shift();
        successCount++;
        saveQueue();
        updateQueueDisplay();
      } else {
        console.log('Lost connection during sync');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error('Sync error:', error);
      statusElement.textContent = 'Sync error - will retry later';
      break;
    }
  }
  
  isSyncing = false;
  syncButton.disabled = false;
  syncButton.classList.remove('syncing');
  
  if (photoQueue.length === 0) {
    const message = noMagicMode 
      ? `All ${successCount} photos saved!`
      : `All ${successCount} photos synced successfully!`;
    statusElement.textContent = message;
    setTimeout(() => {
      updatePresetDisplay();
    }, 2000);
  } else if (!isOnline) {
    statusElement.textContent = `Connection lost. ${photoQueue.length} photos queued.`;
  } else {
    statusElement.textContent = `Synced ${successCount}. ${photoQueue.length} remaining.`;
  }
  
  if (typeof PluginMessageHandler !== 'undefined') {
    PluginMessageHandler.postMessage(JSON.stringify({ 
      action: 'sync_complete',
      synced: successCount,
      remaining: photoQueue.length,
      timestamp: Date.now() 
    }));
  }
}

// Show queue manager
function showQueueManager() {
  const manager = document.getElementById('queue-manager');
  const list = document.getElementById('queue-list');
  
  list.innerHTML = '';
  
  if (photoQueue.length === 0) {
    list.innerHTML = `
      <div class="queue-empty">
        <h4>No Photos in Queue</h4>
        <p>Take photos while offline and they'll appear here for syncing.</p>
      </div>
    `;
  } else {
    photoQueue.forEach((item, index) => {
      const queueItem = document.createElement('div');
      queueItem.className = 'queue-item';
      
      queueItem.innerHTML = `
        <div class="queue-item-header">
          <span class="queue-item-style">${item.preset.name}</span>
          <span class="queue-item-time">${new Date(item.timestamp).toLocaleString()}</span>
        </div>
        <img src="${item.imageBase64}" class="queue-item-preview" alt="Queued photo">
        <div class="queue-item-actions">
          <button onclick="removeFromQueue(${index})" class="delete-button">Remove</button>
          <button onclick="previewQueueItem(${index})" class="secondary">Preview</button>
        </div>
      `;
      
      list.appendChild(queueItem);
    });
  }
  
  manager.style.display = 'flex';
}

// Hide queue manager
function hideQueueManager() {
  document.getElementById('queue-manager').style.display = 'none';
}

// Remove item from queue
async function removeFromQueue(index) {
  if (await confirm('Remove this photo from the sync queue?')) {
    photoQueue.splice(index, 1);
    saveQueue();
    updateQueueDisplay();
    showQueueManager();
  }
}

// Preview queue item
function previewQueueItem(index) {
  const item = photoQueue[index];
  alert(`Style: ${item.preset.name}\nPrompt: ${item.preset.message}\nSaved: ${new Date(item.timestamp).toLocaleString()}`);
}

// Clear entire queue
async function clearQueue() {
  if (await confirm('Clear all photos from the queue? This cannot be undone.')) {
    photoQueue = [];
    saveQueue();
    updateQueueDisplay();
    showQueueManager();
  }
}

// Side button handler
window.addEventListener('sideClick', () => {
  console.log('Side button pressed');
  
  // Settings submenu - select current item
  if (isSettingsSubmenuOpen) {
    const submenu = document.getElementById('settings-submenu');
    const items = submenu.querySelectorAll('.menu-section-button');
    if (items.length > 0 && currentSettingsIndex < items.length) {
      items[currentSettingsIndex].click();
    }
    return;
  }

 // Visible Presets submenu - select current item
  if (isVisiblePresetsSubmenuOpen) {
    selectCurrentVisiblePresetsItem();
    return;
  }

  // Tutorial submenu - select current item
  if (isTutorialSubmenuOpen && tutorialModule) {
    tutorialModule.selectCurrentTutorialItem();
    return;
  }
  
  // Resolution submenu - select current item
  if (isResolutionSubmenuOpen) {
    const submenu = document.getElementById('resolution-submenu');
    const items = submenu.querySelectorAll('.resolution-item');
    if (items.length > 0 && currentResolutionIndex_Menu < items.length) {
      items[currentResolutionIndex_Menu].click();
    }
    return;
  }
  
  if (isPresetSelectorOpen) {
    selectCurrentPresetItem();
    return;
  }
 
  if (isMenuOpen && menuScrollEnabled) {
    selectCurrentMenuItem();
    return;
  }
  
  const startScreen = document.getElementById('start-screen');
  const startButton = document.getElementById('start-button');
  
  if (startScreen && startScreen.style.display !== 'none') {
    console.log('Simulating tap on start button');
    
    setTimeout(() => {
      startButton.click();
    }, 100);
    
  } else if (capturedImage && capturedImage.style.display === 'block') {
    resetToCamera();
  } else {
    // If motion detection is active, side button starts the delay countdown
    if (isMotionDetectionMode) {
      // Show countdown and start motion detection after delay
      if (motionStartDelay > 0) {
        let remainingSeconds = motionStartDelay;
        const countdownElement = document.getElementById('timer-countdown');
        const countdownText = document.getElementById('timer-countdown-text');
        
        countdownText.textContent = remainingSeconds;
        countdownElement.style.display = 'flex';
        countdownElement.classList.remove('countdown-fade-out');
        countdownElement.classList.add('countdown-fade-in');
        
        statusElement.textContent = `Motion Detection starting in ${remainingSeconds}s...`;
        
        motionStartInterval = setInterval(() => {
          remainingSeconds--;
          
          if (remainingSeconds > 0) {
            countdownElement.classList.remove('countdown-fade-in');
            countdownElement.classList.add('countdown-fade-out');
            
            setTimeout(() => {
              countdownText.textContent = remainingSeconds;
              countdownElement.classList.remove('countdown-fade-out');
              countdownElement.classList.add('countdown-fade-in');
              statusElement.textContent = `Motion Detection starting in ${remainingSeconds}s...`;
            }, 500);
          } else {
            countdownElement.classList.remove('countdown-fade-in');
            countdownElement.classList.add('countdown-fade-out');
            
            setTimeout(() => {
              countdownElement.style.display = 'none';
              countdownElement.classList.remove('countdown-fade-out');
              clearInterval(motionStartInterval);
              
              // Start motion detection
              if (isMotionDetectionMode && video && video.readyState >= 2) {
                startMotionDetection();
                showStatus('Motion Detection active - Move in front of camera', 3000);
              }
            }, 500);
          }
        }, 1000);
      } else {
        // No delay - start immediately
        startMotionDetection();
        showStatus('Motion Detection ON - Move in front of camera', 3000);
      }
      return;
    }
    
    // Normal photo capture (not in motion detection mode)
    // Check if timer is active
    if (isTimerMode) {
      if (isBurstMode) {
        startTimerCountdown(() => startBurstCapture());
      } else {
        startTimerCountdown(() => capturePhoto());
      }
    } else {
      // No timer - capture immediately
      if (isBurstMode) {
        startBurstCapture();
      } else {
        capturePhoto();
      }
    }
  }
});

// Scroll wheel handler for preset cycling and menu navigation
window.addEventListener('scrollUp', () => {
  console.log('Scroll wheel: up');
  
  // Style Editor
  if (document.getElementById('style-editor').style.display === 'flex') {
      scrollEditorUp();
      return;
  }

  // Preset selector (gallery)
  if (isPresetSelectorOpen) {
    scrollPresetListUp(); // or Down
    return;
  }
  
  // Import presets modal
  if (presetImporter.isImportModalOpen) {
    presetImporter.scrollImportUp();
    return;
  }

  // Tutorial submenu - CHECK BEFORE MAIN MENU
  if (isTutorialSubmenuOpen && tutorialModule) {
    tutorialModule.scrollTutorialUp();
    return;
  }

    // Preset Builder submenu
  if (isPresetBuilderSubmenuOpen) {
    scrollPresetBuilderUp();
    return;
  }  
  
  // Visible Presets submenu - CHECK BEFORE MAIN MENU
  if (isVisiblePresetsSubmenuOpen) {
    scrollVisiblePresetsUp(); // or Down
    return;
  }

  // Main menu
  if (isMenuOpen && menuScrollEnabled) {
    scrollMenuUp(); // or Down
    return;
  }
  
  // Motion submenu
  if (isMotionSubmenuOpen) {
    scrollMotionUp();
    return;
  }

  // Master prompt submenu
  if (isMasterPromptSubmenuOpen) {
    scrollMasterPromptUp();
    return;
  }
  
  // Timer submenu
  if (isTimerSubmenuOpen) {
    scrollTimerUp();
    return;
  }
  
  // Burst submenu
  if (isBurstSubmenuOpen) {
    scrollBurstUp();
    return;
  }
  
  // Resolution submenu
  if (isResolutionSubmenuOpen) {
    scrollResolutionMenuUp();
    return;
  }
  
  // Settings submenu - CHECK AFTER all other submenus
  if (isSettingsSubmenuOpen) {
    scrollSettingsUp();
    return;
  }
  
  // Gallery
  if (document.getElementById('gallery-modal')?.style.display === 'flex') {
    scrollGalleryUp();
    return;
  }
  
  // Image viewer
  if (document.getElementById('image-viewer')?.style.display === 'flex') {
    scrollViewerUp();
    return;
  }
  
  // Style editor
  if (document.getElementById('style-editor')?.style.display === 'flex') {
    scrollEditorUp();
    return;
  }
  
  // Queue manager
  if (document.getElementById('queue-manager')?.style.display === 'flex') {
    scrollQueueUp();
    return;
  }
  
  // Camera preset cycling
  if (!stream || capturedImage.style.display === 'block') return;
  
  const now = Date.now();
  if (now - lastScrollTime < SCROLL_DEBOUNCE_MS) {
    return;
  }
  lastScrollTime = now;
  
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  scrollTimeout = setTimeout(() => {
    let currentSortedIndex = getCurrentSortedIndex();
    const sortedPresets = getSortedPresets();
    
    currentSortedIndex = (currentSortedIndex - 1 + sortedPresets.length) % sortedPresets.length;
    
    currentPresetIndex = getOriginalIndexFromSorted(currentSortedIndex);
    
    const currentPreset = CAMERA_PRESETS[currentPresetIndex];
    if (currentPreset) {
      showStyleReveal(noMagicMode ? '⚡ NO MAGIC MODE' : currentPreset.name);
    }
    
    updatePresetDisplay();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        action: 'preset_changed',
        preset: CAMERA_PRESETS[currentPresetIndex].name,
        timestamp: Date.now() 
      }));
    }
    
    scrollTimeout = null;
  }, 50);
});

window.addEventListener('scrollDown', () => {
  console.log('Scroll wheel: down');

  // Style Editor
  if (document.getElementById('style-editor').style.display === 'flex') {
      scrollEditorDown();
      return;
  }
  
  // Preset selector (gallery)
  if (isPresetSelectorOpen) {
    scrollPresetListDown();
    return;
  }

  // Import presets modal
  if (presetImporter.isImportModalOpen) {
    presetImporter.scrollImportDown();
    return;
  }

  // Tutorial - CHECK BEFORE Settings submenu
  if (isTutorialSubmenuOpen && tutorialModule) {
    tutorialModule.scrollTutorialDown();
    return;
  }

    // Preset Builder submenu
  if (isPresetBuilderSubmenuOpen) {
    scrollPresetBuilderDown();
    return;
  }

 // Visible Presets submenu
  if (isVisiblePresetsSubmenuOpen) {
    scrollVisiblePresetsDown();
    return;
  }
  
  // Main menu
  if (isMenuOpen && menuScrollEnabled) {
    scrollMenuDown();
    return;
  }

  // Motion submenu
  if (isMotionSubmenuOpen) {
    scrollMotionDown();
    return;
  }
  
  // Master prompt submenu
  if (isMasterPromptSubmenuOpen) {
    scrollMasterPromptDown();
    return;
  }
  
  // Timer submenu
  if (isTimerSubmenuOpen) {
    scrollTimerDown();
    return;
  }
  
  // Burst submenu
  if (isBurstSubmenuOpen) {
    scrollBurstDown();
    return;
  }
  
  // Resolution submenu
  if (isResolutionSubmenuOpen) {
    scrollResolutionMenuDown();
    return;
  }
  
  // Settings submenu - CHECK AFTER all other submenus
  if (isSettingsSubmenuOpen) {
    scrollSettingsDown();
    return;
  }
  
  // Gallery
  if (document.getElementById('gallery-modal')?.style.display === 'flex') {
    scrollGalleryDown();
    return;
  }
  
  // Image viewer
  if (document.getElementById('image-viewer')?.style.display === 'flex') {
    scrollViewerDown();
    return;
  }
  
  // Style editor
  if (document.getElementById('style-editor')?.style.display === 'flex') {
    scrollEditorDown();
    return;
  }
  
  // Queue manager
  if (document.getElementById('queue-manager')?.style.display === 'flex') {
    scrollQueueDown();
    return;
  }
  
  // Camera preset cycling
  if (!stream || capturedImage.style.display === 'block') return;
  
  const now = Date.now();
  if (now - lastScrollTime < SCROLL_DEBOUNCE_MS) {
    return;
  }
  lastScrollTime = now;
  
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
  
  scrollTimeout = setTimeout(() => {
    let currentSortedIndex = getCurrentSortedIndex();
    const sortedPresets = getSortedPresets();
    
    currentSortedIndex = (currentSortedIndex + 1) % sortedPresets.length;
    
    currentPresetIndex = getOriginalIndexFromSorted(currentSortedIndex);
    
    const currentPreset = CAMERA_PRESETS[currentPresetIndex];
    if (currentPreset) {
      showStyleReveal(noMagicMode ? '⚡ NO MAGIC MODE' : currentPreset.name);
    }
    
    updatePresetDisplay();
    
    if (typeof PluginMessageHandler !== 'undefined') {
      PluginMessageHandler.postMessage(JSON.stringify({ 
        action: 'preset_changed',
        preset: CAMERA_PRESETS[currentPresetIndex].name,
        timestamp: Date.now() 
      }));
    }
    
    scrollTimeout = null;
  }, 50);
});

// Function to update preset display
function updatePresetDisplay() {
    currentPresetIndex = Math.max(0, Math.min(currentPresetIndex, CAMERA_PRESETS.length - 1));
    const currentPreset = CAMERA_PRESETS[currentPresetIndex];

    if (videoTrack) {
        try {
            const constraints = {};
            videoTrack.applyConstraints(constraints);
        } catch (e) {
            console.error('Error applying preset constraints:', e);
        }
    }

    if (statusElement) {
        statusElement.textContent = noMagicMode 
          ? `⚡ NO MAGIC MODE`
          : `Style: ${currentPreset.name}`;
    }
    
    // Show style reveal on screen (middle text)
    showStyleReveal(currentPreset.name);

    localStorage.setItem(LAST_USED_PRESET_KEY, currentPresetIndex.toString());

    if (isMenuOpen) {
        updateMenuSelection();
    }
}

// Listen for plugin messages (responses from AI)
window.onPluginMessage = function(data) {
  console.log('Received plugin message:', data);
  
  if (data && data.status === 'processing') {
    statusElement.textContent = 'AI is processing your image...';
  } else if (data && data.status === 'complete') {
    statusElement.textContent = 'AI transformation complete!';
  } else if (data && data.error) {
    statusElement.textContent = 'Error: ' + data.error;
  }
};

// Check if Flutter is available
if (typeof PluginMessageHandler !== 'undefined') {
  console.log('Flutter channel is available');
  
  PluginMessageHandler.postMessage(JSON.stringify({ 
    message: 'AI Camera Styles initialized',
    pluginId: 'com.r1.pixelart'
  }));
} else {
  console.log('Running in development mode - Flutter channel not available');
}

// Reset button handler
function resetToCamera() {
  capturedImage.style.display = 'none';
  
  // Don't stop/restart motion detection if it's active with continuous mode
  if (isMotionDetectionMode && motionContinuousEnabled) {
    // Motion detection is already running, don't interrupt it
  } else {
    stopMotionDetection();
    if (isMotionDetectionMode) {
      startMotionDetection();
    }
  }

  capturedImage.style.transform = 'none';
  video.style.display = 'block';
  resetButton.style.display = 'none';
  
  const cameraButton = document.getElementById('camera-button');
  if (cameraButton && availableCameras.length > 1) {
    cameraButton.style.display = 'flex';
  }
  
  const resolutionButton = document.getElementById('resolution-button');
  if (resolutionButton) {
    resolutionButton.style.display = 'flex';
  }
  
  setTimeout(() => {
    applyZoom(currentZoom);
  }, 50);
  
  updatePresetDisplay();
  
  // Restart QR detection when returning to camera view
  startQRDetection();
}

// Calculate distance between two touch points
function getTouchDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Setup pinch-to-zoom gesture handlers
function setupPinchZoom() {
  const videoElement = document.getElementById('video');
  
  videoElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinching = true;
      initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
      initialZoom = currentZoom;
    }
  }, { passive: false });
  
let zoomThrottleTimeout = null;
videoElement.addEventListener('touchmove', (e) => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / initialPinchDistance;
      
      const newZoom = initialZoom * scale;
      const constraints = getZoomConstraints();
      const clampedZoom = Math.max(constraints.min, Math.min(newZoom, constraints.max));
      
      // Throttle zoom updates to every 50ms
      if (!zoomThrottleTimeout) {
        applyZoom(clampedZoom);
        zoomThrottleTimeout = setTimeout(() => {
          zoomThrottleTimeout = null;
        }, 50);
      }
    }
  }, { passive: false });
  
videoElement.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      if (isPinching) {
        triggerFocus();
      }
      isPinching = false;
      console.log('Pinch ended, current zoom:', currentZoom);
    }
  });
  
  videoElement.addEventListener('touchcancel', () => {
    isPinching = false;
  });
}

// Add tap-to-focus functionality
//function setupTapToFocus() {
//  const videoElement = document.getElementById('video');
//  let longPressTimer = null;
//  let isLongPress = false;
//  
//  videoElement.addEventListener('touchstart', (e) => {
//    if (!isMenuOpen && capturedImage.style.display === 'none') {
//      isLongPress = false;
//      
//      // Start long-press timer (500ms)
//      longPressTimer = setTimeout(() => {
//        isLongPress = true;
//        
//        // Visual feedback for long-press
//        const touch = e.touches[0];
//        const rect = videoElement.getBoundingClientRect();
//        const x = touch.clientX - rect.left;
//        const y = touch.clientY - rect.top;
//        
//        const captureIndicator = document.createElement('div');
//        captureIndicator.style.position = 'absolute';
//        captureIndicator.style.left = x + 'px';
//        captureIndicator.style.top = y + 'px';
//        captureIndicator.style.width = '80px';
//        captureIndicator.style.height = '80px';
//        captureIndicator.style.border = '3px solid #4CAF50';
//        captureIndicator.style.borderRadius = '50%';
//        captureIndicator.style.transform = 'translate(-50%, -50%)';
//        captureIndicator.style.pointerEvents = 'none';
//        captureIndicator.style.animation = 'capturePulse 0.4s ease-out';
//        captureIndicator.style.zIndex = '150';
//        captureIndicator.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
//        
//        document.getElementById('camera-container').appendChild(captureIndicator);
//        
//        setTimeout(() => {
//          captureIndicator.remove();
//        }, 400);
//        
//        // Take photo
//        capturePhoto();
//        
//        // Haptic feedback if available
//        if (navigator.vibrate) {
//          navigator.vibrate(50);
//        }
//      }, 500);
//    }
//  });
//  
//  videoElement.addEventListener('touchend', (e) => {
//    if (longPressTimer) {
//      clearTimeout(longPressTimer);
//      longPressTimer = null;
//    }
//    
//    // If it wasn't a long press, do tap-to-focus
//    if (!isLongPress && !isMenuOpen && capturedImage.style.display === 'none') {
//      triggerFocus();
//      
//      const touch = e.changedTouches[0];
//      const rect = videoElement.getBoundingClientRect();
//      const x = touch.clientX - rect.left;
//      const y = touch.clientY - rect.top;
//      
//      const focusIndicator = document.createElement('div');
//      focusIndicator.style.position = 'absolute';
//      focusIndicator.style.left = x + 'px';
//      focusIndicator.style.top = y + 'px';
//      focusIndicator.style.width = '60px';
//      focusIndicator.style.height = '60px';
//      focusIndicator.style.border = '2px solid #FE5F00';
//      focusIndicator.style.borderRadius = '50%';
//      focusIndicator.style.transform = 'translate(-50%, -50%)';
//      focusIndicator.style.pointerEvents = 'none';
//      focusIndicator.style.animation = 'focusPulse 0.6s ease-out';
//      focusIndicator.style.zIndex = '150';
//      
//      document.getElementById('camera-container').appendChild(focusIndicator);
//      
//      setTimeout(() => {
//        focusIndicator.remove();
//      }, 600);
//    }
//  });
//  
//  videoElement.addEventListener('touchcancel', (e) => {
//    if (longPressTimer) {
//      clearTimeout(longPressTimer);
//      longPressTimer = null;
//    }
//  });
//  
//  // Keep click event for non-touch devices (tap-to-focus only)
//  videoElement.addEventListener('click', (e) => {
//    if (!isMenuOpen && capturedImage.style.display === 'none') {
//      triggerFocus();
//      
//      const rect = videoElement.getBoundingClientRect();
//      const x = e.clientX - rect.left;
//      const y = e.clientY - rect.top;
//      
//      const focusIndicator = document.createElement('div');
//      focusIndicator.style.position = 'absolute';
//      focusIndicator.style.left = x + 'px';
//      focusIndicator.style.top = y + 'px';
//      focusIndicator.style.width = '60px';
//      focusIndicator.style.height = '60px';
//      focusIndicator.style.border = '2px solid #FE5F00';
//      focusIndicator.style.borderRadius = '50%';
//      focusIndicator.style.transform = 'translate(-50%, -50%)';
//      focusIndicator.style.pointerEvents = 'none';
//      focusIndicator.style.animation = 'focusPulse 0.6s ease-out';
//      focusIndicator.style.zIndex = '150';
//      
//      document.getElementById('camera-container').appendChild(focusIndicator);
//      
//      setTimeout(() => {
//        focusIndicator.remove();
//      }, 600);
//    }
//  });
//}

// Unified menu functions
function showUnifiedMenu() {
  const menu = document.getElementById('unified-menu');
  
  // Clear any captured image before opening menu
  if (capturedImage && capturedImage.style.display === 'block') {
    resetToCamera();
  }
  
  populateStylesList();
  // Initialize styles count display
  const stylesCountElement = document.getElementById('styles-count');
  if (stylesCountElement) {
    const { favorites, regular } = getStylesLists();
    const totalVisible = favorites.length + regular.length;
    stylesCountElement.textContent = totalVisible;
  }
  updateResolutionDisplay();
  updateBurstDisplay();
  updateMasterPromptDisplay();
  updateTimerDisplay();
  
  isMenuOpen = true;
  menuScrollEnabled = true;
  
  pauseCamera();
  cancelTimerCountdown();
  menu.style.display = 'flex';
}

async function hideUnifiedMenu() {
  isMenuOpen = false;
  menuScrollEnabled = false;
  currentMenuIndex = 0;
  styleFilterText = '';
  mainMenuFilterByCategory = ''; // Clear category filter
  document.getElementById('style-filter').value = '';
  
  // Hide category hint
  const categoryHint = document.getElementById('menu-category-hint');
  if (categoryHint) {
    categoryHint.style.display = 'none';
  }
  
  document.getElementById('unified-menu').style.display = 'none';
  await resumeCamera();
  
  // Re-show the style reveal footer
  if (noMagicMode) {
    // NO MAGIC MODE overrides everything in footer and popup
    if (statusElement) statusElement.textContent = '⚡ NO MAGIC MODE';
    showStyleReveal('⚡ NO MAGIC MODE');
  } else if (isTimerMode || isBurstMode || isMotionDetectionMode || isRandomMode) {
    let modeName = '';
    if (isTimerMode) modeName = '⏱️ Timer Mode';
    else if (isBurstMode) modeName = '📸 Burst Mode';
    else if (isMotionDetectionMode) modeName = '👁️ Motion Detection';
    else if (isRandomMode) modeName = '🎲 Random Mode';
    if (statusElement) statusElement.textContent = `${modeName} • ${CAMERA_PRESETS[currentPresetIndex] ? CAMERA_PRESETS[currentPresetIndex].name : ''}`;
    showStyleReveal(modeName);
  } else {
    // Update both footer AND popup immediately
    updatePresetDisplay();
  }
}

// Show Settings submenu
function showSettingsSubmenu() {
  const submenu = document.getElementById('settings-submenu');
  const menu = document.getElementById('unified-menu');
  
  updateResolutionDisplay();
  updateBurstDisplay();
  updateTimerDisplay();
  updateMasterPromptDisplay();
  
  menu.style.display = 'none';
  pauseCamera();
  submenu.style.display = 'flex';
  isMenuOpen = false; // ADD THIS LINE
  isSettingsSubmenuOpen = true;
  currentSettingsIndex = 0;
  
  // Highlight first item after render
  setTimeout(() => {
     updateSettingsSelection();
  }, 50);
}

// Hide Settings submenu
function hideSettingsSubmenu() {
  // Check if we should return to gallery
  if (returnToGalleryFromMasterPrompt) {
    returnToGalleryFromMasterPrompt = false;
    document.getElementById('settings-submenu').style.display = 'none';
    isSettingsSubmenuOpen = false;
    document.getElementById('unified-menu').style.display = 'none';
    isMenuOpen = false;
    menuScrollEnabled = false;
    // Show gallery first, then reopen the image viewer
    showGallery().then(() => {
      openImageViewer(savedViewerImageIndex);
    });
    return;
  }
  
  document.getElementById('settings-submenu').style.display = 'none';
  isSettingsSubmenuOpen = false;
  currentSettingsIndex = 0;
  showUnifiedMenu();
}

// Show Timer Settings submenu
function showTimerSettingsSubmenu() {
  const submenu = document.getElementById('timer-settings-submenu');
  const settingsMenu = document.getElementById('settings-submenu');
  
  // Load current values into UI
  const delaySlider = document.getElementById('timer-delay-slider');
  const delayValue = document.getElementById('timer-delay-value');
  const repeatCheckbox = document.getElementById('timer-repeat-enabled');
  
  if (delaySlider && delayValue) {
    const sliderIndex = timerDelayOptions.indexOf(timerDelay);
    delaySlider.value = sliderIndex !== -1 ? sliderIndex + 1 : 3;
    delayValue.textContent = timerDelay;
  }
  
  if (repeatCheckbox) {
    repeatCheckbox.checked = timerRepeatEnabled;
  }
  
  // Load repeat interval input values
  const intervalInput = document.getElementById('timer-repeat-interval-input');
  const intervalUnit = document.getElementById('timer-repeat-interval-unit');
  if (intervalInput && intervalUnit) {
    // Determine best unit and value
    if (timerRepeatInterval >= 3600 && timerRepeatInterval % 3600 === 0) {
      intervalInput.value = timerRepeatInterval / 3600;
      intervalUnit.value = '3600';
    } else if (timerRepeatInterval >= 60 && timerRepeatInterval % 60 === 0) {
      intervalInput.value = timerRepeatInterval / 60;
      intervalUnit.value = '60';
    } else {
      intervalInput.value = timerRepeatInterval;
      intervalUnit.value = '1';
    }
  }
  
  settingsMenu.style.display = 'none';
  pauseCamera();
  submenu.style.display = 'flex';
  isTimerSubmenuOpen = true;
  isSettingsSubmenuOpen = false;
}

// Hide Timer Settings submenu
function hideTimerSettingsSubmenu() {
  document.getElementById('timer-settings-submenu').style.display = 'none';
  isTimerSubmenuOpen = false;
  showSettingsSubmenu();
}

function jumpToTopOfMenu() {
  const scrollContainer = document.querySelector('.styles-menu-scroll-container');
  if (scrollContainer) {
    scrollContainer.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    // Reset selection to first item
    currentMenuIndex = 0;
    updateMenuSelection();
  }
}

function jumpToBottomOfMenu() {
  const scrollContainer = document.querySelector('.styles-menu-scroll-container');
  if (scrollContainer) {
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth'
    });
    // Set selection to last item
    const stylesList = document.getElementById('menu-styles-list');
    if (stylesList) {
      const items = stylesList.querySelectorAll('.style-item');
      if (items.length > 0) {
        currentMenuIndex = items.length - 1;
        updateMenuSelection();
      }
    }
  }
}

function updateResolutionDisplay() {
  const display = document.getElementById('current-resolution-display');
  if (display) {
    const res = RESOLUTION_PRESETS[currentResolutionIndex];
    display.textContent = `${res.width}x${res.height}`;
  }
}

function updateBurstDisplay() {
  const display = document.getElementById('current-burst-display');
  if (display) {
    let speedLabel = 'Medium';
    for (const [key, value] of Object.entries(BURST_SPEEDS)) {
      if (value.delay === burstDelay) {
        speedLabel = value.label;
        break;
      }
    }
    display.textContent = `${burstCount} photos, ${speedLabel}`;
  }
}

function showResolutionSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  pauseCamera();
  
  const submenu = document.getElementById('resolution-submenu');
  const list = document.getElementById('resolution-list');
  list.innerHTML = '';
  
  RESOLUTION_PRESETS.forEach((preset, index) => {
    const item = document.createElement('div');
    item.className = 'resolution-item';
    if (index === currentResolutionIndex) {
      item.classList.add('active');
    }
    
    const name = document.createElement('span');
    name.className = 'resolution-name';
    name.textContent = preset.name;
    
    item.appendChild(name);
    
    item.onclick = () => {
      changeResolution(index);
      hideResolutionSubmenu();
    };
    
    list.appendChild(item);
  });
  
  submenu.style.display = 'flex';
  isResolutionSubmenuOpen = true;
  isSettingsSubmenuOpen = false;
  currentResolutionIndex_Menu = 0;
  
  // Update selection after render
  setTimeout(() => {
    const items = submenu.querySelectorAll('.resolution-item');
    updateResolutionMenuSelection(items);
  }, 100);
}

async function hideResolutionSubmenu() {
  document.getElementById('resolution-submenu').style.display = 'none';
  isResolutionSubmenuOpen = false;
  currentResolutionIndex_Menu = 0;
  showSettingsSubmenu();
  // await resumeCamera();
}

function showBurstSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  pauseCamera();
  
  const submenu = document.getElementById('burst-submenu');
  
  const countSlider = document.getElementById('burst-count-slider');
  const speedSlider = document.getElementById('burst-speed-slider');
  const countValue = document.getElementById('burst-count-value');
  const speedValue = document.getElementById('burst-speed-value');
  
  if (countSlider && countValue) {
    countSlider.value = burstCount;
    countValue.textContent = burstCount;
  }
  
  if (speedSlider && speedValue) {
    let currentSpeed = 2;
    for (const [key, value] of Object.entries(BURST_SPEEDS)) {
      if (value.delay === burstDelay) {
        currentSpeed = parseInt(key);
        break;
      }
    }
    speedSlider.value = currentSpeed;
    speedValue.textContent = BURST_SPEEDS[currentSpeed].label;
  }

  submenu.style.display = 'flex';
  isBurstSubmenuOpen = true;
  isSettingsSubmenuOpen = false;
}

async function hideBurstSubmenu() {
  document.getElementById('burst-submenu').style.display = 'none';
  isBurstSubmenuOpen = false;
  // await resumeCamera();
  showSettingsSubmenu();
}

function showMasterPromptSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  pauseCamera();
  
  const submenu = document.getElementById('master-prompt-submenu');
  const checkbox = document.getElementById('master-prompt-enabled');
  const textarea = document.getElementById('master-prompt-text');
  const charCount = document.getElementById('master-prompt-char-count');
  
  if (checkbox) {
    checkbox.checked = masterPromptEnabled;
  }
  
  if (textarea) {
    textarea.value = masterPromptText;
    textarea.disabled = !masterPromptEnabled;
    if (charCount) {
      charCount.textContent = masterPromptText.length;
    }
  }
  
  submenu.style.display = 'flex';
  isMasterPromptSubmenuOpen = true;
  isSettingsSubmenuOpen = false;
}

async function hideMasterPromptSubmenu() {
  // Check if we should return to gallery
  if (returnToGalleryFromMasterPrompt) {
    returnToGalleryFromMasterPrompt = false;
    document.getElementById('master-prompt-submenu').style.display = 'none';
    isMasterPromptSubmenuOpen = false;
    document.getElementById('settings-submenu').style.display = 'none';
    isSettingsSubmenuOpen = false;
    document.getElementById('unified-menu').style.display = 'none';
    isMenuOpen = false;
    menuScrollEnabled = false;
    // Show gallery first, then reopen the image viewer
    await showGallery();
    openImageViewer(savedViewerImageIndex);
    return;
  }
  
  document.getElementById('master-prompt-submenu').style.display = 'none';
  isMasterPromptSubmenuOpen = false;
  // await resumeCamera();
  showSettingsSubmenu();
}

function showAspectRatioSubmenu() {
  document.getElementById('settings-submenu').style.display = 'none';
  pauseCamera();
  
  const submenu = document.getElementById('aspect-ratio-submenu');
  submenu.style.display = 'flex';
  isAspectRatioSubmenuOpen = true;
  isSettingsSubmenuOpen = false;
}

async function hideAspectRatioSubmenu() {
  document.getElementById('aspect-ratio-submenu').style.display = 'none';
  isAspectRatioSubmenuOpen = false;
  showSettingsSubmenu();
}

function updateAspectRatioDisplay() {
  const display = document.getElementById('current-aspect-ratio-display');
  if (display) {
    display.textContent = selectedAspectRatio === 'none' ? 'None' : selectedAspectRatio;
  }
}

function updateMasterPromptDisplay() {
  const display = document.getElementById('current-master-prompt-display');
  if (display) {
    if (masterPromptEnabled && masterPromptText.trim()) {
      const preview = masterPromptText.substring(0, 20);
      display.textContent = `Enabled: ${preview}${masterPromptText.length > 20 ? '...' : ''}`;
    } else if (masterPromptEnabled) {
      display.textContent = 'Enabled (empty)';
    } else {
      display.textContent = 'Disabled';
    }
  }
}

function saveMasterPrompt() {
  try {
    localStorage.setItem(MASTER_PROMPT_STORAGE_KEY, masterPromptText);
    localStorage.setItem(MASTER_PROMPT_ENABLED_KEY, masterPromptEnabled.toString());
    localStorage.setItem(ASPECT_RATIO_STORAGE_KEY, selectedAspectRatio);
  } catch (err) {
    console.error('Failed to save master prompt:', err);
  }
}

function loadMasterPrompt() {
  try {
    const savedText = localStorage.getItem(MASTER_PROMPT_STORAGE_KEY);
    const savedEnabled = localStorage.getItem(MASTER_PROMPT_ENABLED_KEY);
    
    if (savedText !== null) {
      masterPromptText = savedText;
    }
    
    if (savedEnabled !== null) {
      masterPromptEnabled = savedEnabled === 'true';
    }
    
    // Initialize master prompt indicator
    updateMasterPromptIndicator();
    
    // Load aspect ratio
    const savedAspectRatio = localStorage.getItem(ASPECT_RATIO_STORAGE_KEY);
    if (savedAspectRatio) {
      selectedAspectRatio = savedAspectRatio;
      
      // Update checkboxes
      const checkbox1_1 = document.getElementById('aspect-ratio-1-1');
      const checkbox16_9 = document.getElementById('aspect-ratio-16-9');
      
      if (checkbox1_1) checkbox1_1.checked = (selectedAspectRatio === '1:1');
      if (checkbox16_9) checkbox16_9.checked = (selectedAspectRatio === '16:9');
      
      // Update display
      const displayElement = document.getElementById('current-aspect-ratio-display');
      if (displayElement) {
        displayElement.textContent = selectedAspectRatio === 'none' ? 'None' : selectedAspectRatio;
      }
    }
  } catch (err) {
    console.error('Failed to load master prompt:', err);
  }
}

// Load selection history from localStorage
function loadSelectionHistory() {
  try {
    const saved = localStorage.getItem(SELECTION_HISTORY_KEY);
    if (saved) {
      selectionHistory = JSON.parse(saved);
    }
  } catch (err) {
    console.error('Failed to load selection history:', err);
    selectionHistory = {};
  }
}

// Save selection history to localStorage
function saveSelectionHistory() {
  try {
    localStorage.setItem(SELECTION_HISTORY_KEY, JSON.stringify(selectionHistory));
  } catch (err) {
    console.error('Failed to save selection history:', err);
  }
}

// Add a selection to history
function addToHistory(presetName, selection) {
  if (!presetName || !selection) return;
  
  if (!selectionHistory[presetName]) {
    selectionHistory[presetName] = [];
  }
  
  // Add new selection at the beginning
  selectionHistory[presetName].unshift(selection);
  
  // Keep only the last MAX_HISTORY_PER_PRESET selections
  if (selectionHistory[presetName].length > MAX_HISTORY_PER_PRESET) {
    selectionHistory[presetName] = selectionHistory[presetName].slice(0, MAX_HISTORY_PER_PRESET);
  }
  
  saveSelectionHistory();
}

// Clear history for a specific preset (useful for testing)
function clearPresetHistory(presetName) {
  if (presetName && selectionHistory[presetName]) {
    delete selectionHistory[presetName];
    saveSelectionHistory();
  }
}

// Clear all selection history
function clearAllHistory() {
  selectionHistory = {};
  saveSelectionHistory();
}

function getFinalPrompt(basePrompt, presetName = '', preset = null) {
  let finalPrompt = basePrompt;
  
  if (masterPromptEnabled && masterPromptText.trim()) {
    finalPrompt = `${basePrompt} ${masterPromptText}`;
  }
  
  // NEW: Handle structured options from preset
  if (preset && preset.options && preset.options.length > 0) {
    finalPrompt = processStructuredOptions(finalPrompt, preset.options, preset.randomizeOptions, presetName);
  } else {
    // LEGACY: Check if preset has embedded random selection options (old format)
    const hasRandomOptions = /RANDOM|SELECT|SELECTION|CHOOSE|modulo|LAST DIGIT|LAST TWO DIGITS|LAST THREE DIGITS/i.test(basePrompt);
    
    // Only process random seed if preset has random options
    if (hasRandomOptions) {
      // Generate random seed
      const seed = Date.now();
      const lastDigit = seed % 10;
      const lastTwoDigits = seed % 100;
      const lastThreeDigits = seed % 1000;
      
      // Process the prompt to extract and select from options
      finalPrompt = processRandomSelections(finalPrompt, lastDigit, lastTwoDigits, lastThreeDigits, presetName);
    }
  }
  
  // Add aspect ratio override at the very end
  if (selectedAspectRatio === '1:1') {
    finalPrompt += ' Use a square aspect ratio.';
  } else if (selectedAspectRatio === '16:9') {
    finalPrompt += ' Use a square aspect ratio, but pad the image with black bars at top and bottom to simulate a 16:9 aspect ratio.';
  }
  
  console.log('FINAL PROMPT:', finalPrompt);
  
  return finalPrompt;
}

// NEW: Process structured options array
function processStructuredOptions(basePrompt, options, randomize, presetName) {
  let selectedOption = null;
  
  if (randomize) {
    // Random selection
    const randomIndex = Math.floor(Math.random() * options.length);
    selectedOption = options[randomIndex];
    console.log('RANDOMLY SELECTED OPTION:', selectedOption);
  } else {
    // TODO: Show UI for manual selection
    // For now, default to first option if not randomized
    // (User will select in UI before calling this)
    selectedOption = window.selectedPresetOption || options[0];
    console.log('MANUALLY SELECTED OPTION:', selectedOption);
  }
  
  if (selectedOption) {
    trackSelection(presetName, selectedOption.text);
    // Append option text to base prompt
    return basePrompt + '\n\n' + selectedOption.text;
  }
  
  return basePrompt;
}

function processRandomSelections(prompt, lastDigit, lastTwoDigits, lastThreeDigits, presetName) {
  console.log('=== PROCESSING RANDOM SELECTIONS ===');
  
  // Pattern 1: Even/Odd (50/50)
  const evenOddPattern = /•\s*If\s+(?:the\s+)?(?:LAST\s+DIGIT|RANDOM\s+SEED)(?:\s+of\s+the\s+RANDOM\s+SEED)?(?:\s+ends\s+in)?[^\n]*?(?:is\s+)?(?:an?\s+)?(EVEN|ODD)(?:\s+number)?[^\n]*?:\s*(?:SELECT\s+)?(.+?)(?=\n•|\n\n|$)/gi;
  
  prompt = prompt.replace(evenOddPattern, (match, evenOrOdd, option) => {
    console.log('Found even/odd pattern for:', evenOrOdd);
    
    const isEven = lastDigit % 2 === 0;
    const shouldSelect = (evenOrOdd.toUpperCase() === 'EVEN' && isEven) || (evenOrOdd.toUpperCase() === 'ODD' && !isEven);
    
    if (shouldSelect) {
      const selectedOption = option.trim();
      console.log('SELECTED (even/odd):', selectedOption);
      trackSelection(presetName, selectedOption);
      return '';
    }
    return '';
  });
  
  // After even/odd, capture the selected option
  prompt = prompt.replace(/If\s+Option\s+([AB]):\s*\n([\s\S]*?)(?=\nIf\s+Option\s+[AB]:|\n[A-Z][A-Z\s]+(?:\([A-Z]+\))?:|\n\n|$)/gi, (match, optionLetter, content) => {
    return '';
  });
  
  const selectedOptionPattern = /If\s+Option\s+([AB]):\s*\n([\s\S]*?)(?=\nIf\s+Option|$)/gi;
  let selectedOption = null;
  
  prompt.replace(selectedOptionPattern, (match, optionLetter, content) => {
    if (!selectedOption) {
      selectedOption = content.trim();
    }
    return match;
  });
  
  if (selectedOption) {
    trackSelection(presetName, selectedOption);
    prompt = `SELECTED OPTION: ${selectedOption}\n(Automatically selected using random seed)`;
  }
  
  // UNIFIED MODULO PATTERN - CASE INSENSITIVE (i flag handles Use, USE, use, Via, VIA, via, By, BY, by, etc.)
  const unifiedModuloPattern = /(?:select|choose|pick)?(?:\s+exactly\s+one)?[^\n]*?(?:use|using|with|via|by)\s+(?:the\s+)?(?:last\s+(digit|two\s+digits|three\s+digits)|random\s+seed)(?:\s+of\s+the\s+random\s+seed)?[^\n]*?\s+modulo\s+(\d+)[^\n]*?:\s*\n((?:\s*-\s*\d+:.*(?:\n|$))*)/gi;
  
  prompt = prompt.replace(unifiedModuloPattern, (match, digitType, moduloNumber, contentBlock) => {
    let actualDigitType;
    if (!digitType) {
      actualDigitType = 'TWO DIGITS';
    } else if (digitType.toLowerCase().includes('three')) {
      actualDigitType = 'THREE DIGITS';
    } else if (digitType.toLowerCase().includes('two')) {
      actualDigitType = 'TWO DIGITS';
    } else {
      actualDigitType = 'DIGIT';
    }
    
    console.log('Found modulo pattern:', actualDigitType, 'modulo', moduloNumber);
    return processModuloSelection(actualDigitType, moduloNumber, contentBlock, lastDigit, lastTwoDigits, lastThreeDigits, presetName, match);
  });
  
  // Clean up selection instruction lines
  prompt = prompt.replace(/•\s*If\s+none\s+is\s+specified[^\n]*\n/gi, '');
  prompt = prompt.replace(/•\s*If\s+no\s+\w+\s+is\s+specified[^\n]*\n/gi, '');
  prompt = prompt.replace(/•\s*Otherwise\s+SELECT[^\n]*\n/gi, '');
  
  // Remove orphaned section headers
  prompt = prompt.replace(/^\s*[A-Z][A-Z\s]+(?:\([A-Z]+\))?:\s*$/gm, '');
  
  // Clean up multiple blank lines
  prompt = prompt.replace(/\n{3,}/g, '\n\n');
  
  console.log('=== FINISHED PROCESSING ===');
  
  return prompt;
}

// Helper function to process modulo selections
function processModuloSelection(digitType, moduloNumber, contentBlock, lastDigit, lastTwoDigits, lastThreeDigits, presetName, originalMatch) {
  // Parse the options list
  const options = [];
  const optionPattern = /^\s*[-–]\s*(\d+):\s*(.+?)$/gm;
  let optionMatch;
  
  while ((optionMatch = optionPattern.exec(contentBlock)) !== null) {
    const number = parseInt(optionMatch[1]);
    const option = optionMatch[2].trim();
    options.push({ number, option });
    console.log(`  Found option ${number}: ${option.substring(0, 50)}`);
  }
  
  if (options.length === 0) {
    console.log('  No options found, keeping original');
    return originalMatch;
  }
  
  // Determine which value to use
  let selectedValue;
  if (digitType === 'DIGIT') {
    selectedValue = lastDigit;
  } else if (digitType === 'TWO DIGITS') {
    selectedValue = lastTwoDigits;
  } else if (digitType === 'THREE DIGITS') {
    selectedValue = lastThreeDigits;
  }
  
  console.log('  Selected value before modulo:', selectedValue);
  
  // Calculate modulo
  const totalOptions = parseInt(moduloNumber);
  const selectionIndex = selectedValue % totalOptions;
  
  console.log('  Selection index after modulo:', selectionIndex);
  
  // Find the matching option
  const selected = options.find(o => o.number === selectionIndex);
  
  if (selected) {
    console.log('  SELECTED:', selected.option);
    trackSelection(presetName, selected.option);
    return `SELECTED OPTION: ${selected.option}\n(Automatically selected using random seed)`;
  }
  
  console.log('  No matching option found!');
  return originalMatch;
}

function trackSelection(presetName, selectedOption) {
  if (!presetName || !selectedOption) return;
  
  // Get current history
  const history = getPresetHistory(presetName);
  
  // Add new selection to beginning
  history.unshift(selectedOption);
  
  // Keep only last 5 selections
  if (history.length > MAX_HISTORY_PER_PRESET) {
    history.splice(MAX_HISTORY_PER_PRESET);
  }
  
  // Save back to storage
  selectionHistory[presetName] = history;
  localStorage.setItem(SELECTION_HISTORY_KEY, JSON.stringify(selectionHistory));
}

function getPresetHistory(presetName) {
  if (!presetName) return [];
  
  // Load history from storage if not in memory
  if (!selectionHistory[presetName]) {
    const stored = localStorage.getItem(SELECTION_HISTORY_KEY);
    if (stored) {
      try {
        selectionHistory = JSON.parse(stored);
      } catch (e) {
        selectionHistory = {};
      }
    }
  }
  
  return selectionHistory[presetName] || [];
}

function populateStylesList(preserveScroll = false) {
    const list = document.getElementById('menu-styles-list');
    list.innerHTML = '';
    
    // Remove old event listener if it exists
    list.replaceWith(list.cloneNode(false));
    const newList = document.getElementById('menu-styles-list');
    
    const fragment = document.createDocumentFragment();
    
    const { favorites, regular } = getStylesLists();
    
    const filteredFavorites = favorites.filter(preset => {
      // First apply text search filter
      if (styleFilterText) {
        const searchText = styleFilterText.toLowerCase();
        const categoryMatch = preset.category && preset.category.some(cat => cat.toLowerCase().includes(searchText));
        const textMatch = preset.name.toLowerCase().includes(searchText) || 
               preset.message.toLowerCase().includes(searchText) ||
               categoryMatch;
        if (!textMatch) return false;
      }
      
      // Then apply category filter if active
      if (mainMenuFilterByCategory) {
        return preset.category && preset.category.includes(mainMenuFilterByCategory);
      }
      
      return true;
    });
    
    const filtered = regular.filter(preset => {
      // First apply text search filter
      if (styleFilterText) {
        const searchText = styleFilterText.toLowerCase();
        const categoryMatch = preset.category && preset.category.some(cat => cat.toLowerCase().includes(searchText));
        const textMatch = preset.name.toLowerCase().includes(searchText) || 
               preset.message.toLowerCase().includes(searchText) ||
               categoryMatch;
        if (!textMatch) return false;
      }
      
      // Then apply category filter if active
      if (mainMenuFilterByCategory) {
        return preset.category && preset.category.includes(mainMenuFilterByCategory);
      }
      
      return true;
    });

    if (filteredFavorites.length > 0) {
        const favHeader = document.createElement('h3');
        favHeader.className = 'menu-section-header';
        favHeader.textContent = '★ Favorites';
        fragment.appendChild(favHeader);

        filteredFavorites.forEach(preset => {
            const item = createStyleMenuItemFast(preset);
            fragment.appendChild(item);
        });
    }

    if (filtered.length > 0) {
        const regularHeader = document.createElement('h3');
        regularHeader.className = 'menu-section-header';
        regularHeader.textContent = styleFilterText ? 'Search Results' : 'All Styles';
        fragment.appendChild(regularHeader);
        
        filtered.forEach(preset => {
            const item = createStyleMenuItemFast(preset);
            fragment.appendChild(item);
        });
    }
    
    if (filtered.length === 0 && filteredFavorites.length === 0 && styleFilterText) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'menu-empty';
      emptyMsg.textContent = 'No styles found';
      fragment.appendChild(emptyMsg);
    }

    newList.appendChild(fragment);
    
    // Single event listener for the entire list using event delegation
    newList.addEventListener('click', handleStyleListClick);

// Update styles count - count from getStylesLists which already filters to visible
  const stylesCountElement = document.getElementById('styles-count');
  if (stylesCountElement) {
    const { favorites, regular } = getStylesLists();
    const totalVisible = favorites.length + regular.length;
    stylesCountElement.textContent = totalVisible;
  }
    
    if (!preserveScroll) {
        currentMenuIndex = 0;
        updateMenuSelection();
    }
}

function createStyleMenuItemFast(preset) {
    const originalIndex = CAMERA_PRESETS.findIndex(p => p === preset);
    
    const item = document.createElement('div');
    item.className = 'style-item';
    item.dataset.index = originalIndex; // Store index in data attribute
    
    if (originalIndex === currentPresetIndex) {
        item.classList.add('active');
    }
    
    const favBtn = document.createElement('button');
    favBtn.className = 'style-favorite';
    favBtn.textContent = isFavoriteStyle(preset.name) ? '⭐' : '☆';
    favBtn.dataset.action = 'favorite';
    favBtn.dataset.styleName = preset.name;
    
    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = preset.name;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'style-edit';
    
    // Check if this is a user-created preset (has internal: false)
    const isUserPreset = (preset.internal === false);
    editBtn.textContent = isUserPreset ? 'Builder' : 'Edit';
    editBtn.dataset.action = isUserPreset ? 'builder' : 'edit';
    editBtn.dataset.index = originalIndex;
    
    item.appendChild(favBtn);
    item.appendChild(name);
    item.appendChild(editBtn);
    
    return item;
}

// Add this new event delegation handler
function handleStyleListClick(e) {
    const target = e.target;
    
    // Handle favorite button click
    if (target.dataset.action === 'favorite') {
        e.stopPropagation();
        const styleName = target.dataset.styleName;
        saveFavoriteStyle(styleName);
        return;
    }
    
    // Handle edit button click
    if (target.dataset.action === 'edit') {
        e.stopPropagation();
        const index = parseInt(target.dataset.index);
        editStyle(index);
        return;
    }
    
    // Handle builder button click
    if (target.dataset.action === 'builder') {
        e.stopPropagation();
        const index = parseInt(target.dataset.index);
        editPresetInBuilder(index);
        return;
    }
    
    // Handle item click
    const item = target.closest('.style-item');
    if (item) {
        const index = parseInt(item.dataset.index);
        if (!isNaN(index)) {
            currentPresetIndex = index;
            updatePresetDisplay();
            hideUnifiedMenu();
        }
    }
}

function showStyleEditor(title = 'Add New Style') {
  const editor = document.getElementById('style-editor');
  document.getElementById('editor-title').textContent = title;
  editor.style.display = 'flex';
  
  // Focus the scrollable body to enable R1 scroll wheel
  setTimeout(() => {
    const editorBody = document.querySelector('.style-editor-body');
    if (editorBody) {
      editorBody.focus();
    }
  }, 100);
}

// Detect keyboard visibility and adjust style editor layout
let styleEditorKeyboardVisible = false;

// Detect when inputs receive focus (keyboard likely opening)
function handleStyleEditorInputFocus() {
  if (!styleEditorKeyboardVisible) {
    styleEditorKeyboardVisible = true;
    const editorBody = document.querySelector('.style-editor-body');
    if (editorBody) {
      editorBody.style.gap = '0.5vh';
      editorBody.style.paddingBottom = '0.5vw';
    }
  }
}

// Detect when inputs lose focus (keyboard likely closing)
function handleStyleEditorInputBlur() {
  // Only reset if no other input in the editor has focus
  setTimeout(() => {
    const editorInputs = document.querySelectorAll('.style-input, .style-textarea');
    const anyFocused = Array.from(editorInputs).some(input => input === document.activeElement);
    
    if (!anyFocused && styleEditorKeyboardVisible) {
      styleEditorKeyboardVisible = false;
      const editorBody = document.querySelector('.style-editor-body');
      if (editorBody) {
        editorBody.style.gap = '1vh';
        editorBody.style.paddingBottom = '1vw';
      }
    }
  }, 100);
}

// Add event listeners to style editor inputs
const styleNameInput = document.getElementById('style-name');
const styleCategoryInput = document.getElementById('style-category');
const styleMessageTextarea = document.getElementById('style-message');

if (styleNameInput) {
  styleNameInput.addEventListener('focus', handleStyleEditorInputFocus);
  styleNameInput.addEventListener('blur', handleStyleEditorInputBlur);
}

if (styleCategoryInput) {
  styleCategoryInput.addEventListener('focus', handleStyleEditorInputFocus);
  styleCategoryInput.addEventListener('blur', handleStyleEditorInputBlur);
}

if (styleMessageTextarea) {
  styleMessageTextarea.addEventListener('focus', handleStyleEditorInputFocus);
  styleMessageTextarea.addEventListener('blur', handleStyleEditorInputBlur);
}

function hideStyleEditor() {
  document.getElementById('style-editor').style.display = 'none';
  document.getElementById('style-name').value = '';
  document.getElementById('style-message').value = '';
  const categoryInput = document.getElementById('style-category');
  if (categoryInput) {
    categoryInput.value = '';
  }
  document.getElementById('delete-style').style.display = 'none';
  editingStyleIndex = -1;
}

function editStyle(index) {
  editingStyleIndex = index;
  const preset = CAMERA_PRESETS[index];
  
  document.getElementById('style-name').value = preset.name;
  document.getElementById('style-message').value = preset.message;
  
  const categoryInput = document.getElementById('style-category');
  if (categoryInput) {
    categoryInput.value = preset.category ? preset.category.join(', ') : '';
  }
  
  document.getElementById('delete-style').style.display = 'block';
  
  showStyleEditor('Edit Style');
}

async function saveStyle() {
  const name = document.getElementById('style-name').value.trim();
  const message = document.getElementById('style-message').value.trim();
  const categoryInput = document.getElementById('style-category').value.trim();
  
  // Parse categories from comma-separated string
  const category = categoryInput ? 
    categoryInput.split(',').map(c => c.trim().toUpperCase()).filter(c => c.length > 0) : 
    [];
  
  if (!name || !message) {
    alert('Please fill in both name and AI prompt');
    return;
  }
  
  if (editingStyleIndex >= 0) {
    const oldName = CAMERA_PRESETS[editingStyleIndex].name;
    CAMERA_PRESETS[editingStyleIndex] = { name, category, message };
    
    // Check if it's a factory preset OR imported preset
    const isFactoryPreset = factoryPresets.some(p => p.name === oldName);
    const isImportedPreset = hasImportedPresets && presetImporter.getImportedPresets().some(p => p.name === oldName);
    
    if (isFactoryPreset || isImportedPreset) {
      // Save as modification (doesn't change the original)
      await presetStorage.saveModification(oldName, {
        name: name,
        message: message,
        category: category
      });
    } else {
      // User-created preset - update it directly
      await presetStorage.saveNewPreset({ name, category, message });
    }
    
    // If name changed, update visiblePresets array
    if (oldName !== name) {
      const visIndex = visiblePresets.indexOf(oldName);
      if (visIndex > -1) {
        visiblePresets[visIndex] = name;
        saveVisiblePresets();
      }
    }
  } else {
    const newPreset = { name, category, message };
    await presetStorage.saveNewPreset(newPreset);
    CAMERA_PRESETS.push(newPreset);
    // ADD NEW PRESET TO VISIBLE LIST AUTOMATICALLY
    visiblePresets.push(name);
    saveVisiblePresets();
  }
  
  // saveStyles(); // REMOVED - redundant, already saved to IndexedDB above
  
  alert(editingStyleIndex >= 0 ? `Preset "${name}" updated!` : `Preset "${name}" saved!`);
  
  hideStyleEditor();
  showUnifiedMenu();
}

async function deleteStyle() {
  if (editingStyleIndex >= 0 && CAMERA_PRESETS.length > 1) {
    if (await confirm('Delete this style?')) {
      const presetName = CAMERA_PRESETS[editingStyleIndex].name;
      
      // Check if it's a factory preset, imported preset, or user-created
      const isFactoryPreset = factoryPresets.some(p => p.name === presetName);
      const isImportedPreset = hasImportedPresets && presetImporter.getImportedPresets().some(p => p.name === presetName);
      
      if (isImportedPreset) {
        // Delete from imported presets
        await presetImporter.deletePreset(presetName);
      } else if (isFactoryPreset) {
        // Mark factory preset as deleted
        await presetStorage.saveDeletion(presetName);
      } else {
        // Remove user-created preset
        await presetStorage.removeModification(presetName);
      }
      
      CAMERA_PRESETS.splice(editingStyleIndex, 1);
      
      // Remove from visible presets
      const visIndex = visiblePresets.indexOf(presetName);
      if (visIndex > -1) {
        visiblePresets.splice(visIndex, 1);
        saveVisiblePresets();
      }
      
      // Save whether we're deleting the currently active preset BEFORE modifying currentPresetIndex
      const deletingCurrentPreset = (editingStyleIndex === currentPresetIndex);
      
      // Determine new current preset index after deletion
      if (editingStyleIndex === currentPresetIndex) {
        // We deleted the currently selected preset
        // Move to previous preset, or stay at 0 if we deleted the first one
        currentPresetIndex = Math.max(0, editingStyleIndex - 1);
      } else if (editingStyleIndex < currentPresetIndex) {
        // We deleted a preset before the current one, so shift current index down
        currentPresetIndex = currentPresetIndex - 1;
      }
      // If we deleted a preset after the current one, currentPresetIndex stays the same
      
      // Ensure index is within bounds
      currentPresetIndex = Math.max(0, Math.min(currentPresetIndex, CAMERA_PRESETS.length - 1));
      
      saveStyles();
      
      // If we deleted the currently active preset, switch to first visible preset
      if (deletingCurrentPreset) {
        const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
        if (visiblePresetObjects.length > 0) {
          currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
        } else if (CAMERA_PRESETS.length > 0) {
          // No visible presets, just use first available
          currentPresetIndex = 0;
        }
      }
      
      // After deletion, verify the current preset is visible; if not, switch to first visible
      const currentPreset = CAMERA_PRESETS[currentPresetIndex];
      if (currentPreset && !visiblePresets.includes(currentPreset.name)) {
        // Current preset is not visible, switch to first visible preset
        const visiblePresetObjects = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name));
        if (visiblePresetObjects.length > 0) {
          currentPresetIndex = CAMERA_PRESETS.findIndex(p => p.name === visiblePresetObjects[0].name);
        } else if (CAMERA_PRESETS.length > 0) {
          // No visible presets, just use first available
          currentPresetIndex = 0;
        }
      }
      
      // Update the preset display to reflect the switch
      updatePresetDisplay();
      
      // Update visible presets display to reflect deletion
      updateVisiblePresetsDisplay();
      
      hideStyleEditor();
      
      // Save scroll position before showing menu
      const scrollContainer = document.querySelector('.styles-menu-scroll-container');
      const scrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;
      
      showUnifiedMenu();
      
      // Restore scroll position after menu is shown
      if (scrollContainer) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollPosition;
        });
      }
      
      alert(`Preset "${presetName}" deleted successfully!`);
    }
  }
}

// Generate mechanical camera shutter sound using Web Audio API
function playCameraShutterSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const currentTime = audioContext.currentTime;
    
    // === INTRO: High-pitched metallic prep sound ===
    const introOsc = audioContext.createOscillator();
    const introGain = audioContext.createGain();
    const introFilter = audioContext.createBiquadFilter();
    
    introOsc.type = 'square';
    introOsc.frequency.setValueAtTime(2400, currentTime);
    introOsc.frequency.exponentialRampToValueAtTime(1800, currentTime + 0.012);
    
    introFilter.type = 'highpass';
    introFilter.frequency.setValueAtTime(1500, currentTime);
    
    introGain.gain.setValueAtTime(0.5, currentTime);
    introGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.015);
    
    introOsc.connect(introFilter);
    introFilter.connect(introGain);
    introGain.connect(audioContext.destination);
    
    introOsc.start(currentTime);
    introOsc.stop(currentTime + 0.015);
    
    // === FIRST CLICK: Shutter opening (sharp, metallic) ===
    const click1Osc = audioContext.createOscillator();
    const click1Gain = audioContext.createGain();
    const click1Filter = audioContext.createBiquadFilter();
    
    click1Osc.type = 'square';
    click1Osc.frequency.setValueAtTime(1200, currentTime + 0.015);
    click1Osc.frequency.exponentialRampToValueAtTime(200, currentTime + 0.023);
    
    click1Filter.type = 'bandpass';
    click1Filter.frequency.setValueAtTime(1500, currentTime + 0.015);
    click1Filter.Q.setValueAtTime(2, currentTime + 0.015);
    
    click1Gain.gain.setValueAtTime(0.4, currentTime + 0.015);
    click1Gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.030);
    
    click1Osc.connect(click1Filter);
    click1Filter.connect(click1Gain);
    click1Gain.connect(audioContext.destination);
    
    click1Osc.start(currentTime + 0.015);
    click1Osc.stop(currentTime + 0.030);
    
    // === MECHANICAL RATTLE: Spring tension ===
    const rattleOsc = audioContext.createOscillator();
    const rattleGain = audioContext.createGain();
    
    rattleOsc.type = 'triangle';
    rattleOsc.frequency.setValueAtTime(400, currentTime + 0.023);
    rattleOsc.frequency.setValueAtTime(450, currentTime + 0.027);
    rattleOsc.frequency.setValueAtTime(380, currentTime + 0.031);
    rattleOsc.frequency.setValueAtTime(420, currentTime + 0.035);
    
    rattleGain.gain.setValueAtTime(0, currentTime + 0.023);
    rattleGain.gain.linearRampToValueAtTime(0.15, currentTime + 0.025);
    rattleGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.040);
    
    rattleOsc.connect(rattleGain);
    rattleGain.connect(audioContext.destination);
    
    rattleOsc.start(currentTime + 0.023);
    rattleOsc.stop(currentTime + 0.040);
    
    // === SECOND CLICK: Shutter closing (deeper, firm) ===
    const click2Osc = audioContext.createOscillator();
    const click2Gain = audioContext.createGain();
    const click2Filter = audioContext.createBiquadFilter();
    
    click2Osc.type = 'square';
    click2Osc.frequency.setValueAtTime(800, currentTime + 0.050);
    click2Osc.frequency.exponentialRampToValueAtTime(150, currentTime + 0.060);
    
    click2Filter.type = 'bandpass';
    click2Filter.frequency.setValueAtTime(1000, currentTime + 0.050);
    click2Filter.Q.setValueAtTime(2, currentTime + 0.050);
    
    click2Gain.gain.setValueAtTime(0.5, currentTime + 0.050);
    click2Gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.070);
    
    click2Osc.connect(click2Filter);
    click2Filter.connect(click2Gain);
    click2Gain.connect(audioContext.destination);
    
    click2Osc.start(currentTime + 0.050);
    click2Osc.stop(currentTime + 0.070);
    
    // === METAL RESONANCE: Body vibration ===
    const resonanceOsc = audioContext.createOscillator();
    const resonanceGain = audioContext.createGain();
    const resonanceFilter = audioContext.createBiquadFilter();
    
    resonanceOsc.type = 'sine';
    resonanceOsc.frequency.setValueAtTime(180, currentTime + 0.050);
    resonanceOsc.frequency.exponentialRampToValueAtTime(120, currentTime + 0.095);
    
    resonanceFilter.type = 'lowpass';
    resonanceFilter.frequency.setValueAtTime(300, currentTime + 0.050);
    
    resonanceGain.gain.setValueAtTime(0, currentTime + 0.050);
    resonanceGain.gain.linearRampToValueAtTime(0.2, currentTime + 0.055);
    resonanceGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.105);
    
    resonanceOsc.connect(resonanceFilter);
    resonanceFilter.connect(resonanceGain);
    resonanceGain.connect(audioContext.destination);
    
    resonanceOsc.start(currentTime + 0.050);
    resonanceOsc.stop(currentTime + 0.105);
    
    // === FILM ADVANCE: Mechanical winding ===
    const bufferSize = audioContext.sampleRate * 0.08;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      // Create rhythmic noise pattern for gear sound
      const rhythm = Math.sin(i / 200) * 0.5 + 0.5;
      output[i] = (Math.random() * 2 - 1) * rhythm;
    }
    
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(3000, currentTime + 0.070);
    noiseFilter.Q.setValueAtTime(1, currentTime + 0.070);
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0, currentTime + 0.070);
    noiseGain.gain.linearRampToValueAtTime(0.12, currentTime + 0.075);
    noiseGain.gain.linearRampToValueAtTime(0.12, currentTime + 0.125);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.150);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    
    noiseSource.start(currentTime + 0.070);
    noiseSource.stop(currentTime + 0.150);
    
    // === FINAL LOCK CLICK: Winding complete ===
    const lockOsc = audioContext.createOscillator();
    const lockGain = audioContext.createGain();
    
    lockOsc.type = 'square';
    lockOsc.frequency.setValueAtTime(600, currentTime + 0.145);
    lockOsc.frequency.exponentialRampToValueAtTime(100, currentTime + 0.155);
    
    lockGain.gain.setValueAtTime(0.25, currentTime + 0.145);
    lockGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.165);
    
    lockOsc.connect(lockGain);
    lockGain.connect(audioContext.destination);
    
    lockOsc.start(currentTime + 0.145);
    lockOsc.stop(currentTime + 0.165);
    
  } catch (err) {
    console.log('Audio generation failed:', err);
  }
}

// Initialize on load
window.addEventListener('load', () => {
  loadStyles();
  loadMasterPrompt();
  loadSelectionHistory();
  setupPinchZoom();
//  setupTapToFocus();
  
  const startBtn = document.getElementById('start-button');
if (startBtn) {
  startBtn.addEventListener('click', () => {
    // Play shutter sound
    playCameraShutterSound();
    
    // Add camera flash effect
    const cameraBody = document.querySelector('.camera-body');
    if (cameraBody) {
      cameraBody.style.transition = 'all 0.1s';
      cameraBody.style.boxShadow = '0 0 50px rgba(255, 255, 255, 1)';
      setTimeout(() => {
        cameraBody.style.boxShadow = '';
      }, 100);
    }
    
    // Add lens snap effect
    const lensInner = document.querySelector('.lens-inner');
    if (lensInner) {
      lensInner.style.transition = 'all 0.05s';
      lensInner.style.transform = 'translate(-50%, -50%) scale(0.95)';
      setTimeout(() => {
        lensInner.style.transform = 'translate(-50%, -50%) scale(1)';
      }, 50);
    }
    
    // Initialize camera after brief delay for effect
    setTimeout(() => {
      initCamera();
    }, 300);
  });
}

  const burstToggleBtn = document.getElementById('burst-toggle');
  if (burstToggleBtn) {
    burstToggleBtn.addEventListener('click', toggleBurstMode);
  }

  const timerToggleBtn = document.getElementById('timer-toggle');
  if (timerToggleBtn) {
    timerToggleBtn.addEventListener('click', toggleTimerMode);
  }
  
  const randomToggleBtn = document.getElementById('random-toggle');
  if (randomToggleBtn) {
    randomToggleBtn.addEventListener('click', toggleRandomMode);
  }

  const motionToggleBtn = document.getElementById('motion-toggle');
  if (motionToggleBtn) {
    motionToggleBtn.addEventListener('click', toggleMotionDetection);
  }
  
  const menuBtn = document.getElementById('menu-button');
  if (menuBtn) {
    menuBtn.addEventListener('click', showUnifiedMenu);
  }
  
  const closeMenuBtn = document.getElementById('close-menu');
  if (closeMenuBtn) {
    closeMenuBtn.addEventListener('click', hideUnifiedMenu);
  }

  const jumpToTopBtn = document.getElementById('jump-to-top');
  if (jumpToTopBtn) {
    jumpToTopBtn.addEventListener('click', jumpToTopOfMenu);
  }
  
  const jumpToBottomBtn = document.getElementById('jump-to-bottom');
  if (jumpToBottomBtn) {
    jumpToBottomBtn.addEventListener('click', jumpToBottomOfMenu);
  }
  
  const settingsMenuBtn = document.getElementById('settings-menu-button');
  if (settingsMenuBtn) {
    settingsMenuBtn.addEventListener('click', showSettingsSubmenu);
  }
  
  const settingsBackBtn = document.getElementById('settings-back');
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', hideSettingsSubmenu);
  }
  
  const resolutionSettingsBtn = document.getElementById('resolution-settings-button');
  if (resolutionSettingsBtn) {
    resolutionSettingsBtn.addEventListener('click', showResolutionSubmenu);
  }
  
  const resolutionBackBtn = document.getElementById('resolution-back');
  if (resolutionBackBtn) {
    resolutionBackBtn.addEventListener('click', hideResolutionSubmenu);
  }
  
  const burstSettingsBtn = document.getElementById('burst-settings-button');
  if (burstSettingsBtn) {
    burstSettingsBtn.addEventListener('click', showBurstSubmenu);
  }
  
  const burstBackBtn = document.getElementById('burst-back');
  if (burstBackBtn) {
    burstBackBtn.addEventListener('click', hideBurstSubmenu);
  }

  const timerSettingsBtn = document.getElementById('timer-settings-button');
  if (timerSettingsBtn) {
    timerSettingsBtn.addEventListener('click', showTimerSettingsSubmenu);
  }
  
  const timerSettingsBackBtn = document.getElementById('timer-settings-back');
  if (timerSettingsBackBtn) {
    timerSettingsBackBtn.addEventListener('click', hideTimerSettingsSubmenu);
  }
 
  const masterPromptSettingsBtn = document.getElementById('master-prompt-settings-button');
  if (masterPromptSettingsBtn) {
    masterPromptSettingsBtn.addEventListener('click', showMasterPromptSubmenu);
  }
  
  const masterPromptBackBtn = document.getElementById('master-prompt-back');
  if (masterPromptBackBtn) {
    masterPromptBackBtn.addEventListener('click', hideMasterPromptSubmenu);
  }
  
  const aspectRatioSettingsBtn = document.getElementById('aspect-ratio-settings-button');
  if (aspectRatioSettingsBtn) {
    aspectRatioSettingsBtn.addEventListener('click', showAspectRatioSubmenu);
  }
  
  const aspectRatioBackBtn = document.getElementById('aspect-ratio-back');
  if (aspectRatioBackBtn) {
    aspectRatioBackBtn.addEventListener('click', hideAspectRatioSubmenu);
  }
  
  // Aspect ratio checkboxes - make them mutually exclusive
  const aspectRatio1_1 = document.getElementById('aspect-ratio-1-1');
  const aspectRatio16_9 = document.getElementById('aspect-ratio-16-9');
  
  if (aspectRatio1_1) {
    aspectRatio1_1.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedAspectRatio = '1:1';
        if (aspectRatio16_9) aspectRatio16_9.checked = false;
      } else {
        selectedAspectRatio = 'none';
      }
      saveMasterPrompt();
      updateAspectRatioDisplay();
    });
  }
  
  if (aspectRatio16_9) {
    aspectRatio16_9.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedAspectRatio = '16:9';
        if (aspectRatio1_1) aspectRatio1_1.checked = false;
      } else {
        selectedAspectRatio = 'none';
      }
      saveMasterPrompt();
      updateAspectRatioDisplay();
    });
  }

  const motionSettingsBtn = document.getElementById('motion-settings-button');
  if (motionSettingsBtn) {
    motionSettingsBtn.addEventListener('click', showMotionSubmenu);
  }
  
  const motionBackBtn = document.getElementById('motion-back');
  if (motionBackBtn) {
    motionBackBtn.addEventListener('click', hideMotionSubmenu);
  }

  const visiblePresetsSettingsBtn = document.getElementById('visible-presets-settings-button');
  if (visiblePresetsSettingsBtn) {
    visiblePresetsSettingsBtn.addEventListener('click', showVisiblePresetsSubmenu);
  }
  
  const visiblePresetsBackBtn = document.getElementById('visible-presets-back');
  if (visiblePresetsBackBtn) {
    visiblePresetsBackBtn.addEventListener('click', hideVisiblePresetsSubmenu);
  }

  // Preset Builder
  const presetBuilderBtn = document.getElementById('preset-builder-button');
  if (presetBuilderBtn) {
    presetBuilderBtn.addEventListener('click', showPresetBuilderSubmenu);
  }
  
  const presetBuilderBack = document.getElementById('preset-builder-back');
  if (presetBuilderBack) {
    presetBuilderBack.addEventListener('click', hidePresetBuilderSubmenu);
  }
  
  // Enable scroll for preset builder
  const presetBuilderJumpUp = document.getElementById('preset-builder-jump-up');
  if (presetBuilderJumpUp) {
    presetBuilderJumpUp.addEventListener('click', scrollPresetBuilderUp);
  }
  
  const presetBuilderJumpDown = document.getElementById('preset-builder-jump-down');
  if (presetBuilderJumpDown) {
    presetBuilderJumpDown.addEventListener('click', scrollPresetBuilderDown);
  }
  
  const presetBuilderTemplate = document.getElementById('preset-builder-template');
  if (presetBuilderTemplate) {
    presetBuilderTemplate.addEventListener('change', handleTemplateSelection);
  }
  
  // Handle Enter key navigation in preset builder
  const presetBuilderName = document.getElementById('preset-builder-name');
  if (presetBuilderName) {
    presetBuilderName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('preset-builder-category')?.focus();
      }
    });
  }
  
  const presetBuilderCategory = document.getElementById('preset-builder-category');
  const categoryAutocomplete = document.getElementById('category-autocomplete');
  
  if (presetBuilderCategory && categoryAutocomplete) {
    // Show autocomplete suggestions
    const showCategorySuggestions = () => {
      const inputValue = presetBuilderCategory.value;
      const lastComma = inputValue.lastIndexOf(',');
      const currentCategory = (lastComma >= 0 ? inputValue.substring(lastComma + 1) : inputValue).trim().toUpperCase();
      
      const allCategories = getAllCategories();
      const filteredCategories = currentCategory 
        ? allCategories.filter(cat => cat.includes(currentCategory))
        : allCategories;
      
      if (filteredCategories.length > 0) {
        categoryAutocomplete.innerHTML = filteredCategories
          .map(cat => `<div class="category-autocomplete-item" data-category="${cat}">${cat}</div>`)
          .join('');
        categoryAutocomplete.style.display = 'block';
      } else {
        categoryAutocomplete.style.display = 'none';
      }
    };
    
    // Insert selected category
    const insertCategory = (category) => {
      const inputValue = presetBuilderCategory.value;
      const lastComma = inputValue.lastIndexOf(',');
      
      if (lastComma >= 0) {
        // Replace the last category after the comma
        presetBuilderCategory.value = inputValue.substring(0, lastComma + 1) + ' ' + category + ', ';
      } else {
        // Replace entire input
        presetBuilderCategory.value = category + ', ';
      }
      
      categoryAutocomplete.style.display = 'none';
      presetBuilderCategory.focus();
    };
    
    // Show suggestions on input
    presetBuilderCategory.addEventListener('input', showCategorySuggestions);
    
    // Show suggestions on focus
    presetBuilderCategory.addEventListener('focus', showCategorySuggestions);
    
    // Handle clicking on autocomplete items
    categoryAutocomplete.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-autocomplete-item')) {
        const category = e.target.getAttribute('data-category');
        insertCategory(category);
      }
    });
    
    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!presetBuilderCategory.contains(e.target) && !categoryAutocomplete.contains(e.target)) {
        categoryAutocomplete.style.display = 'none';
      }
    });
    
    // Handle Enter key
    presetBuilderCategory.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        categoryAutocomplete.style.display = 'none';
        document.getElementById('preset-builder-template')?.focus();
      }
    });
  }
  
  const presetBuilderSave = document.getElementById('preset-builder-save');
  if (presetBuilderSave) {
    presetBuilderSave.addEventListener('click', saveCustomPreset);
  }
  
  const presetBuilderClear = document.getElementById('preset-builder-clear');
  if (presetBuilderClear) {
    presetBuilderClear.addEventListener('click', clearPresetBuilderForm);
  }

  const presetBuilderDelete = document.getElementById('preset-builder-delete');
  if (presetBuilderDelete) {
    presetBuilderDelete.addEventListener('click', deleteCustomPreset);
  }

  // Collapsible chip sections
  const chipSectionHeaders = document.querySelectorAll('.chip-section-header');
  chipSectionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const section = header.getAttribute('data-section');
      const content = document.getElementById('section-' + section);
      const isExpanded = content.style.display === 'block';
      
      // Close all sections
      document.querySelectorAll('.chip-section-content').forEach(c => {
        c.style.display = 'none';
      });
      document.querySelectorAll('.chip-section-header').forEach(h => {
        h.classList.remove('expanded');
      });
      
      // Toggle current section
      if (!isExpanded) {
        content.style.display = 'block';
        header.classList.add('expanded');
      }
    });
  });

  // Preset Builder chip buttons
  const presetChips = document.querySelectorAll('.preset-chip');
  presetChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      const textToAdd = e.target.getAttribute('data-text');
      const promptTextarea = document.getElementById('preset-builder-prompt');
      const currentText = promptTextarea.value;
      
      // Add text at the end
      if (currentText.trim()) {
        promptTextarea.value = currentText + ' ' + textToAdd;
      } else {
        promptTextarea.value = textToAdd;
      }
      
      // Scroll to bottom of textarea
      promptTextarea.scrollTop = promptTextarea.scrollHeight;
    });
  });
  
   // Quality dropdown
  const qualitySelect = document.getElementById('preset-builder-quality');
  if (qualitySelect) {
    qualitySelect.addEventListener('change', (e) => {
      const textToAdd = e.target.value;
      if (textToAdd) {
        const promptTextarea = document.getElementById('preset-builder-prompt');
        const currentText = promptTextarea.value;
        
        if (currentText.trim()) {
          promptTextarea.value = currentText + ' ' + textToAdd;
        } else {
          promptTextarea.value = textToAdd;
        }
        
        // Reset dropdown
        e.target.value = '';
        promptTextarea.scrollTop = promptTextarea.scrollHeight;
      }
    });
  }

  const visiblePresetsFilter = document.getElementById('visible-presets-filter');
  if (visiblePresetsFilter) {
    visiblePresetsFilter.addEventListener('input', (e) => {
      visiblePresetsFilterText = e.target.value;
      populateVisiblePresetsList();
    });
    
    // Hide category footer when field is focused (keyboard appears)
    visiblePresetsFilter.addEventListener('focus', () => {
      isVisiblePresetsFilterFocused = true;
      const categoryHint = document.getElementById('visible-presets-category-hint');
      if (categoryHint) {
        categoryHint.style.display = 'none';
      }
    });
    
    // Show category footer when keyboard dismissed
    visiblePresetsFilter.addEventListener('blur', () => {
      isVisiblePresetsFilterFocused = false;
      // Category footer will be restored by updateVisiblePresetsSelection when needed
    });
  }
  
  const visiblePresetsSelectAll = document.getElementById('visible-presets-select-all');
  if (visiblePresetsSelectAll) {
    visiblePresetsSelectAll.addEventListener('click', () => {
      const allPresets = CAMERA_PRESETS.filter(p => !p.internal);
      visiblePresets = allPresets.map(p => p.name);
      saveVisiblePresets();
      populateVisiblePresetsList();
      updateVisiblePresetsDisplay();
      if (isMenuOpen) populateStylesList();
    });
  }
  
  const visiblePresetsDeselectAll = document.getElementById('visible-presets-deselect-all');
  if (visiblePresetsDeselectAll) {
    visiblePresetsDeselectAll.addEventListener('click', () => {
      visiblePresets = [];
      saveVisiblePresets();
      populateVisiblePresetsList();
      updateVisiblePresetsDisplay();
      if (isMenuOpen) populateStylesList();
    });
  }
  
  const visiblePresetsJumpUp = document.getElementById('visible-presets-jump-up');
  if (visiblePresetsJumpUp) {
    visiblePresetsJumpUp.addEventListener('click', () => {
      currentVisiblePresetsIndex = 0;
      updateVisiblePresetsSelection();
    });
  }
  
  const visiblePresetsJumpDown = document.getElementById('visible-presets-jump-down');
  if (visiblePresetsJumpDown) {
    visiblePresetsJumpDown.addEventListener('click', () => {
      const list = document.getElementById('visible-presets-list');
      if (list) {
        const items = list.querySelectorAll('.style-item');
        if (items.length > 0) {
          currentVisiblePresetsIndex = items.length - 1;
          updateVisiblePresetsSelection();
        }
      }
    });
  }

// ========== IMAGE EDITOR FUNCTIONALITY ==========
let editorCanvas = null;
let editorCtx = null;
let editorOriginalImage = null;
let editorCurrentImage = null;
let editorHistory = [];
let editorCurrentRotation = 0;
let editorBrightness = 0;
let editorContrast = 0;
let isCropMode = false;
let cropPoint1 = null;
let cropPoint2 = null;

// Open image editor
function openImageEditor() {
  const imageToEdit = galleryImages[currentViewerImageIndex];
  if (!imageToEdit) return;
  
  // Hide viewer, show editor
  document.getElementById('image-viewer').style.display = 'none';
  document.getElementById('image-editor-modal').style.display = 'flex';
  
  // Initialize canvas
  editorCanvas = document.getElementById('editor-canvas');
  editorCtx = editorCanvas.getContext('2d', { willReadFrequently: true });
  
  // Load image
  const img = new Image();
  img.onload = () => {
    editorOriginalImage = img;
    editorCurrentImage = img;
    editorHistory = [];
    editorCurrentRotation = 0;
    editorBrightness = 0;
    editorContrast = 0;
    
    // Reset sliders
    document.getElementById('brightness-slider').value = 0;
    document.getElementById('contrast-slider').value = 0;
    document.getElementById('brightness-value').textContent = '0';
    document.getElementById('contrast-value').textContent = '0';
    
    renderEditorImage();
    updateUndoButton();
  };
  img.src = imageToEdit.imageBase64;
}

// Render current image to canvas
function renderEditorImage() {
  if (!editorCurrentImage || !editorCanvas) return;
  
  // CRITICAL: Keep canvas at ORIGINAL resolution - don't downscale!
  // Canvas dimensions = actual image dimensions
  editorCanvas.width = editorCurrentImage.width;
  editorCanvas.height = editorCurrentImage.height;
  
  // Clear canvas
  editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  
  // Draw image at FULL original resolution
  editorCtx.drawImage(editorCurrentImage, 0, 0);
  
  // Apply brightness and contrast
  if (editorBrightness !== 0 || editorContrast !== 0) {
    applyBrightnessContrast();
  }
  
  // Let CSS handle the display scaling (canvas will auto-scale to fit container)
  // The .editor-canvas CSS already has max-width: 100%; max-height: 100%;
}

// Apply brightness and contrast
function applyBrightnessContrast() {
  const imageData = editorCtx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;
  
  const brightness = editorBrightness;
  const contrast = (editorContrast + 100) / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast
    data[i] = ((data[i] / 255 - 0.5) * contrast + 0.5) * 255;
    data[i + 1] = ((data[i + 1] / 255 - 0.5) * contrast + 0.5) * 255;
    data[i + 2] = ((data[i + 2] / 255 - 0.5) * contrast + 0.5) * 255;
    
    // Apply brightness
    data[i] += brightness;
    data[i + 1] += brightness;
    data[i + 2] += brightness;
    
    // Clamp values
    data[i] = Math.max(0, Math.min(255, data[i]));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]));
  }
  
  editorCtx.putImageData(imageData, 0, 0);
}

// Rotate image
function rotateImage() {
  saveToHistory();
  
  editorCurrentRotation = (editorCurrentRotation + 90) % 360;
  
  // Create temporary canvas for rotation
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  
  // Swap width/height for 90° or 270° rotations
  if (editorCurrentRotation === 90 || editorCurrentRotation === 270) {
    tempCanvas.width = editorCurrentImage.height;
    tempCanvas.height = editorCurrentImage.width;
  } else {
    tempCanvas.width = editorCurrentImage.width;
    tempCanvas.height = editorCurrentImage.height;
  }
  
  // Perform rotation
  tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
  tempCtx.rotate((editorCurrentRotation * Math.PI) / 180);
  tempCtx.drawImage(editorCurrentImage, -editorCurrentImage.width / 2, -editorCurrentImage.height / 2);
  
  // Create new image from rotated canvas
  const rotatedImg = new Image();
  rotatedImg.onload = () => {
    editorCurrentImage = rotatedImg;
    renderEditorImage();
  };
  rotatedImg.src = tempCanvas.toDataURL('image/jpeg', 0.95);
}

// Sharpen image
function sharpenImage() {
  saveToHistory();
  
  const imageData = editorCtx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;
  const width = editorCanvas.width;
  const height = editorCanvas.height;
  
  // Create output array
  const output = new Uint8ClampedArray(data);
  
  // Sharpening kernel (3x3)
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  // Apply convolution
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) { // RGB channels only
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
            const kernelIndex = (ky + 1) * 3 + (kx + 1);
            sum += data[pixelIndex] * kernel[kernelIndex];
          }
        }
        output[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, sum));
      }
    }
  }
  
  // Copy output back to imageData
  for (let i = 0; i < data.length; i += 4) {
    data[i] = output[i];
    data[i + 1] = output[i + 1];
    data[i + 2] = output[i + 2];
  }
  
  editorCtx.putImageData(imageData, 0, 0);
  
  // Save current canvas as new image
  const newImg = new Image();
  newImg.onload = () => {
    editorCurrentImage = newImg;
    renderEditorImage();
  };
  newImg.src = editorCanvas.toDataURL('image/jpeg', 0.95);
}

// Auto-correct (simple enhancement)
function autoCorrect() {
  saveToHistory();
  
  const imageData = editorCtx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
  const data = imageData.data;
  
  // Simple auto-enhance: increase contrast and saturation slightly
  const contrast = 1.15;
  const saturation = 1.2;
  const brightness = 5;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // Apply contrast
    r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
    g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
    b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
    
    // Apply saturation
    const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
    r = gray + saturation * (r - gray);
    g = gray + saturation * (g - gray);
    b = gray + saturation * (b - gray);
    
    // Apply brightness
    r += brightness;
    g += brightness;
    b += brightness;
    
    // Clamp values
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
  
  editorCtx.putImageData(imageData, 0, 0);
  
  // Save current canvas as new image
  const newImg = new Image();
  newImg.onload = () => {
    editorCurrentImage = newImg;
    renderEditorImage();
  };
  newImg.src = editorCanvas.toDataURL('image/jpeg', 0.95);
}

// Enter crop mode
function enterCropMode() {
  isCropMode = !isCropMode;
  const cropOverlay = document.getElementById('crop-overlay');
  const cropButton = document.getElementById('crop-button');
  
  if (isCropMode) {
    cropOverlay.style.display = 'block';
    cropButton.classList.add('active');
    cropPoint1 = null;
    cropPoint2 = null;
    
    // Reset crop corners to default positions
    const container = document.querySelector('.editor-image-container');
    const containerRect = container.getBoundingClientRect();
    const canvasRect = editorCanvas.getBoundingClientRect();
    
    const topLeft = document.querySelector('.crop-top-left');
    const bottomRight = document.querySelector('.crop-bottom-right');
    
    topLeft.style.left = ((canvasRect.left - containerRect.left) + canvasRect.width * 0.1) + 'px';
    topLeft.style.top = ((canvasRect.top - containerRect.top) + canvasRect.height * 0.1) + 'px';
    
    bottomRight.style.right = (containerRect.right - canvasRect.right + canvasRect.width * 0.1) + 'px';
    bottomRight.style.bottom = (containerRect.bottom - canvasRect.bottom + canvasRect.height * 0.1) + 'px';
    
  } else {
    cropOverlay.style.display = 'none';
    cropButton.classList.remove('active');
  }
}

// Perform crop
function performCrop() {
  if (!isCropMode) return;
  
  saveToHistory();
  
  const container = document.querySelector('.editor-image-container');
  const containerRect = container.getBoundingClientRect();
  const canvasRect = editorCanvas.getBoundingClientRect();
  
  const topLeft = document.querySelector('.crop-top-left');
  const bottomRight = document.querySelector('.crop-bottom-right');
  
  const topLeftRect = topLeft.getBoundingClientRect();
  const bottomRightRect = bottomRight.getBoundingClientRect();
  
  // Calculate crop coordinates relative to canvas
  const x1 = topLeftRect.left - canvasRect.left;
  const y1 = topLeftRect.top - canvasRect.top;
  const x2 = bottomRightRect.right - canvasRect.left;
  const y2 = bottomRightRect.bottom - canvasRect.top;
  
  const cropWidth = x2 - x1;
  const cropHeight = y2 - y1;
  
  if (cropWidth <= 0 || cropHeight <= 0) {
    alert('Invalid crop area');
    return;
  }
  
  // Create cropped image
  const scaleX = editorCurrentImage.width / canvasRect.width;
  const scaleY = editorCurrentImage.height / canvasRect.height;
  
  const sourceX = x1 * scaleX;
  const sourceY = y1 * scaleY;
  const sourceWidth = cropWidth * scaleX;
  const sourceHeight = cropHeight * scaleY;
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceWidth;
  tempCanvas.height = sourceHeight;
  const tempCtx = tempCanvas.getContext('2d');
  
  tempCtx.drawImage(
    editorCurrentImage,
    sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, sourceWidth, sourceHeight
  );
  
  // Create new image from cropped canvas
  const croppedImg = new Image();
  croppedImg.onload = () => {
    editorCurrentImage = croppedImg;
    isCropMode = false;
    document.getElementById('crop-overlay').style.display = 'none';
    document.getElementById('crop-button').classList.remove('active');
    renderEditorImage();
  };
  croppedImg.src = tempCanvas.toDataURL('image/jpeg', 0.95);
}

// Save current state to history
function saveToHistory() {
  const historyItem = {
    image: editorCurrentImage,
    rotation: editorCurrentRotation,
    brightness: editorBrightness,
    contrast: editorContrast
  };
  editorHistory.push(historyItem);
  updateUndoButton();
}

// Undo last action
function undoEdit() {
  if (editorHistory.length === 0) return;
  
  const previousState = editorHistory.pop();
  editorCurrentImage = previousState.image;
  editorCurrentRotation = previousState.rotation;
  editorBrightness = previousState.brightness;
  editorContrast = previousState.contrast;
  
  document.getElementById('brightness-slider').value = editorBrightness;
  document.getElementById('contrast-slider').value = editorContrast;
  document.getElementById('brightness-value').textContent = editorBrightness;
  document.getElementById('contrast-value').textContent = editorContrast;
  
  renderEditorImage();
  updateUndoButton();
}

// Update undo button state
function updateUndoButton() {
  const undoButton = document.getElementById('undo-edit-button');
  undoButton.disabled = editorHistory.length === 0;
}

// Save edited image
async function saveEditedImage() {
  // Get final canvas with all adjustments
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = editorCanvas.width;
  finalCanvas.height = editorCanvas.height;
  const finalCtx = finalCanvas.getContext('2d');
  
  // Copy current canvas
  finalCtx.drawImage(editorCanvas, 0, 0);
  
  // Convert to base64
  const editedBase64 = finalCanvas.toDataURL('image/jpeg', 0.9);
  
  // Create new image entry
  const newImageData = {
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
    imageBase64: editedBase64,
    timestamp: Date.now()
  };
  
  // Add to gallery
  galleryImages.unshift(newImageData);
  await saveImageToDB(newImageData);
  
  // Update the viewer to show the NEW edited image
  currentViewerImageIndex = 0; // The new image is now at index 0
  const viewerImg = document.getElementById('viewer-image');
  viewerImg.src = editedBase64;
  viewerImg.style.transform = 'scale(1) translate(0, 0)';
  viewerZoom = 1;
  
  // Close editor
  closeImageEditor();
  
  // Refresh gallery
  await showGallery();
  showGalleryStatusMessage('Edited image saved!', 'success', 3000);
}

// Close image editor
function closeImageEditor() {
  document.getElementById('image-editor-modal').style.display = 'none';
  document.getElementById('image-viewer').style.display = 'flex';
  
  // Reset crop mode
  isCropMode = false;
  document.getElementById('crop-overlay').style.display = 'none';
  document.getElementById('crop-button').classList.remove('active');
}

// Event listeners for image editor
document.getElementById('edit-viewer-image')?.addEventListener('click', openImageEditor);
document.getElementById('close-image-editor')?.addEventListener('click', closeImageEditor);
document.getElementById('rotate-button')?.addEventListener('click', rotateImage);
document.getElementById('sharpen-button')?.addEventListener('click', sharpenImage);
document.getElementById('autocorrect-button')?.addEventListener('click', autoCorrect);
document.getElementById('undo-edit-button')?.addEventListener('click', undoEdit);
document.getElementById('save-edit-button')?.addEventListener('click', saveEditedImage);

// Crop button toggles crop mode, then applies crop on second click
let cropClickCount = 0;
document.getElementById('crop-button')?.addEventListener('click', () => {
  if (!isCropMode) {
    enterCropMode();
    cropClickCount = 0;
  } else {
    performCrop();
  }
});

// Brightness slider
document.getElementById('brightness-slider')?.addEventListener('input', (e) => {
  editorBrightness = parseInt(e.target.value);
  document.getElementById('brightness-value').textContent = editorBrightness;
  renderEditorImage();
});

// Contrast slider
document.getElementById('contrast-slider')?.addEventListener('input', (e) => {
  editorContrast = parseInt(e.target.value);
  document.getElementById('contrast-value').textContent = editorContrast;
  renderEditorImage();
});

// Drag crop corners
let draggedCorner = null;

document.querySelectorAll('.crop-corner').forEach(corner => {
  corner.addEventListener('touchstart', (e) => {
    e.preventDefault();
    draggedCorner = corner;
  });
});

document.addEventListener('touchmove', (e) => {
  if (!draggedCorner || !isCropMode) return;
  e.preventDefault();
  
  const touch = e.touches[0];
  const container = document.querySelector('.editor-image-container');
  const containerRect = container.getBoundingClientRect();
  const canvasRect = editorCanvas.getBoundingClientRect();
  
  // Calculate position relative to container
  let x = touch.clientX - containerRect.left;
  let y = touch.clientY - containerRect.top;
  
  // Get canvas boundaries relative to container
  const canvasLeft = canvasRect.left - containerRect.left;
  const canvasTop = canvasRect.top - containerRect.top;
  const canvasRight = canvasRect.right - containerRect.left;
  const canvasBottom = canvasRect.bottom - containerRect.top;
  
  // Get corner size
  const cornerSize = draggedCorner.offsetWidth;
  
  if (draggedCorner.classList.contains('crop-top-left')) {
    // Clamp to canvas boundaries
    x = Math.max(canvasLeft, Math.min(x, canvasRight - cornerSize));
    y = Math.max(canvasTop, Math.min(y, canvasBottom - cornerSize));
    
    // Also ensure it doesn't go past bottom-right corner
    const bottomRight = document.querySelector('.crop-bottom-right');
    const bottomRightRect = bottomRight.getBoundingClientRect();
    const maxX = bottomRightRect.right - containerRect.left - cornerSize * 2;
    const maxY = bottomRightRect.bottom - containerRect.top - cornerSize * 2;
    
    x = Math.min(x, maxX);
    y = Math.min(y, maxY);
    
    draggedCorner.style.left = x + 'px';
    draggedCorner.style.top = y + 'px';
    
  } else if (draggedCorner.classList.contains('crop-bottom-right')) {
    // Clamp to canvas boundaries
    x = Math.max(canvasLeft + cornerSize, Math.min(x, canvasRight));
    y = Math.max(canvasTop + cornerSize, Math.min(y, canvasBottom));
    
    // Also ensure it doesn't go past top-left corner
    const topLeft = document.querySelector('.crop-top-left');
    const topLeftRect = topLeft.getBoundingClientRect();
    const minX = topLeftRect.right - containerRect.left + cornerSize;
    const minY = topLeftRect.bottom - containerRect.top + cornerSize;
    
    x = Math.max(x, minX);
    y = Math.max(y, minY);
    
    draggedCorner.style.right = (containerRect.width - x) + 'px';
    draggedCorner.style.bottom = (containerRect.height - y) + 'px';
  }
});

document.addEventListener('touchend', () => {
  draggedCorner = null;
});

// ========== END IMAGE EDITOR ==========

  // White Balance Settings - COMMENTED OUT
  // const whiteBalanceSettingsBtn = document.getElementById('white-balance-settings-button');
  // if (whiteBalanceSettingsBtn) {
  //   whiteBalanceSettingsBtn.addEventListener('click', showWhiteBalanceSubmenu);
  // }
  
  // const whiteBalanceBackBtn = document.getElementById('white-balance-back');
  // if (whiteBalanceBackBtn) {
  //   whiteBalanceBackBtn.addEventListener('click', hideWhiteBalanceSubmenu);
  // }

  const motionSensitivitySlider = document.getElementById('motion-sensitivity-slider');
  const motionSensitivityValue = document.getElementById('motion-sensitivity-value');
  if (motionSensitivitySlider && motionSensitivityValue) {
    const sensitivityLabels = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
    motionSensitivitySlider.addEventListener('input', (e) => {
      const level = parseInt(e.target.value);
      motionSensitivityValue.textContent = sensitivityLabels[level - 1];
      // Convert slider (1-5) to threshold (50-10)
      motionThreshold = 50 - (level * 10);
      saveMotionSettings();
      updateMotionDisplay();
    });
  }
  
  const motionContinuousCheckbox = document.getElementById('motion-continuous-enabled');
  if (motionContinuousCheckbox) {
    motionContinuousCheckbox.addEventListener('change', (e) => {
      motionContinuousEnabled = e.target.checked;
      saveMotionSettings();
    });
  }
  
  const motionCooldownSlider = document.getElementById('motion-cooldown-slider');
  const motionCooldownValue = document.getElementById('motion-cooldown-value');
  if (motionCooldownSlider && motionCooldownValue) {
    motionCooldownSlider.addEventListener('input', (e) => {
      motionCooldown = parseInt(e.target.value);
      motionCooldownValue.textContent = `${motionCooldown}s`;
      saveMotionSettings();
    });
  }

  const motionStartDelaySlider = document.getElementById('motion-start-delay-slider');
  const motionStartDelayValue = document.getElementById('motion-start-delay-value');
  if (motionStartDelaySlider && motionStartDelayValue) {
    motionStartDelaySlider.addEventListener('input', (e) => {
      const key = parseInt(e.target.value);
      motionStartDelay = MOTION_START_DELAYS[key].seconds;
      motionStartDelayValue.textContent = MOTION_START_DELAYS[key].label;
      saveMotionSettings();
    });
  }

  const noMagicToggleBtn = document.getElementById('no-magic-toggle-button');
  if (noMagicToggleBtn) {
    noMagicToggleBtn.addEventListener('click', toggleNoMagicMode);
  }

  const tutorialBtn = document.getElementById('tutorial-button');
  if (tutorialBtn) {
    tutorialBtn.addEventListener('click', openTutorialLazy);
  }
  
  const tutorialBackBtn = document.getElementById('tutorial-back');
  if (tutorialBackBtn) {
    tutorialBackBtn.addEventListener('click', async () => {
      if (tutorialModule) {
        tutorialModule.closeTutorial();
        isTutorialOpen = tutorialModule.isTutorialOpenState();
        isTutorialSubmenuOpen = tutorialModule.isTutorialSubmenuOpenState();
      }
    });
  }
  
// Import presets button handler
  const importPresetsBtn = document.getElementById('import-presets-button');
  if (importPresetsBtn) {
    importPresetsBtn.addEventListener('click', async () => {
      try {
const result = await presetImporter.import();
        
        if (result.success) {
          // Save preset names that existed BEFORE import (to detect truly new presets)
          const presetsBeforeImport = new Set(CAMERA_PRESETS.map(p => p.name));
          
          // Reload presets (merges imported + modifications)
          CAMERA_PRESETS = await mergePresetsWithStorage();
          
          // Clean up visible presets after reloading and add only NEW presets
          const validPresetNames = new Set(CAMERA_PRESETS.map(p => p.name));
          
          // Keep existing visible presets that are still valid
          visiblePresets = visiblePresets.filter(name => validPresetNames.has(name));
          
          // Add ONLY truly NEW presets (ones that didn't exist before import) as visible by default
          CAMERA_PRESETS.forEach(preset => {
            if (!presetsBeforeImport.has(preset.name) && !visiblePresets.includes(preset.name)) {
              visiblePresets.push(preset.name);
            }
          });
          
          saveVisiblePresets();
          
          // Update menu display
          populateStylesList();
          updateVisiblePresetsDisplay();
          
          // Update styles count
          const stylesCountElement = document.getElementById('styles-count');
          if (stylesCountElement) {
            const visibleCount = CAMERA_PRESETS.filter(p => visiblePresets.includes(p.name)).length;
            stylesCountElement.textContent = visibleCount;
          }
          
          alert(result.message);
        } else if (result.message !== 'cancelled' && result.message !== 'No presets selected') {
          alert('Import failed: ' + result.message);
        }
      } catch (error) {
        alert('Import error: ' + error.message);
      }
    });
  }

  // Glossary navigation
  const glossaryItems = document.querySelectorAll('.glossary-item');
  glossaryItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      showTutorialSection(sectionId);
    });
  });
  
  const backToGlossaryBtn = document.getElementById('back-to-glossary');
  if (backToGlossaryBtn) {
    backToGlossaryBtn.addEventListener('click', () => {
      // Tutorial module should be loaded when this button is visible
      if (tutorialModule && tutorialModule.showGlossary) {
        tutorialModule.showGlossary();
      }
    });
  }

  const masterPromptCheckbox = document.getElementById('master-prompt-enabled');
  if (masterPromptCheckbox) {
    masterPromptCheckbox.addEventListener('change', (e) => {
      masterPromptEnabled = e.target.checked;
      const textarea = document.getElementById('master-prompt-text');
      if (textarea) {
        textarea.disabled = !masterPromptEnabled;
      }
      saveMasterPrompt();
      
      // Update main screen indicator
      const mpIndicator = document.getElementById('master-prompt-indicator');
      if (mpIndicator) {
        mpIndicator.style.display = masterPromptEnabled ? 'block' : 'none';
      }

      updateMasterPromptDisplay();
    });
  }
  
  const masterPromptTextarea = document.getElementById('master-prompt-text');
  if (masterPromptTextarea) {
    masterPromptTextarea.addEventListener('input', (e) => {
      masterPromptText = e.target.value;
      const charCount = document.getElementById('master-prompt-char-count');
      if (charCount) {
        charCount.textContent = masterPromptText.length;
      }
      saveMasterPrompt();
      updateMasterPromptDisplay();
    });
  }

 const styleFilter = document.getElementById('style-filter');
  let filterDebounceTimeout = null;
  if (styleFilter) {
    styleFilter.addEventListener('input', (e) => {
      styleFilterText = e.target.value;
      
      // Debounce filter updates
      if (filterDebounceTimeout) clearTimeout(filterDebounceTimeout);
      filterDebounceTimeout = setTimeout(() => {
        populateStylesList();
      }, 150); // Wait 150ms after user stops typing
    });
    
    // Hide category footer when field is focused (keyboard appears)
    styleFilter.addEventListener('focus', () => {
      isStyleFilterFocused = true;
      const categoryHint = document.getElementById('menu-category-hint');
      if (categoryHint) {
        categoryHint.style.display = 'none';
      }
    });
    
    // Show category footer when keyboard dismissed
    styleFilter.addEventListener('blur', () => {
      isStyleFilterFocused = false;
      // Category footer will be restored by updateMenuSelection when needed
    });
  }
   
  const burstCountSlider = document.getElementById('burst-count-slider');
  const burstSpeedSlider = document.getElementById('burst-speed-slider');
  
  if (burstCountSlider) {
    burstCountSlider.addEventListener('input', (e) => {
      burstCount = parseInt(e.target.value);
      document.getElementById('burst-count-value').textContent = burstCount;
      
      const speedKey = parseInt(burstSpeedSlider.value);
      saveBurstSettings(burstCount, speedKey);
      updateBurstDisplay();
      
      if (isBurstMode) {
        statusElement.textContent = noMagicMode
          ? `⚡ NO MAGIC MODE • 📸 Burst Mode`
          : `Burst mode ON (${burstCount} photos) • ${CAMERA_PRESETS[currentPresetIndex].name}`;
      }
    });
  }
  
  if (burstSpeedSlider) {
    burstSpeedSlider.addEventListener('input', (e) => {
      const speedKey = parseInt(e.target.value);
      burstDelay = BURST_SPEEDS[speedKey].delay;
      document.getElementById('burst-speed-value').textContent = BURST_SPEEDS[speedKey].label;
      
      saveBurstSettings(burstCount, speedKey);
      updateBurstDisplay();
    });
  }

  // Timer settings listeners
  const timerDelaySlider = document.getElementById('timer-delay-slider');
  const timerDelayValue = document.getElementById('timer-delay-value');
  if (timerDelaySlider && timerDelayValue) {
    timerDelaySlider.addEventListener('input', (e) => {
      const index = parseInt(e.target.value) - 1;
      timerDelay = timerDelayOptions[index];
      timerDelayValue.textContent = timerDelay;
      saveTimerSettings();
      updateTimerDisplay();
    });
  }
  
  const timerRepeatCheckbox = document.getElementById('timer-repeat-enabled');
  if (timerRepeatCheckbox) {
    timerRepeatCheckbox.addEventListener('change', (e) => {
      timerRepeatEnabled = e.target.checked;
      saveTimerSettings();
      updateTimerDisplay();
    });
  }

  // Timer repeat interval input
  const timerRepeatIntervalInput = document.getElementById('timer-repeat-interval-input');
  const timerRepeatIntervalUnit = document.getElementById('timer-repeat-interval-unit');
  if (timerRepeatIntervalInput && timerRepeatIntervalUnit) {
    const updateRepeatInterval = () => {
      const value = parseInt(timerRepeatIntervalInput.value) || 1;
      const multiplier = parseInt(timerRepeatIntervalUnit.value);
      timerRepeatInterval = value * multiplier;
      saveTimerSettings();
      updateTimerDisplay();
    };
    
    timerRepeatIntervalInput.addEventListener('input', updateRepeatInterval);
    timerRepeatIntervalUnit.addEventListener('change', updateRepeatInterval);
  }

  loadBurstSettings();
  loadTimerSettings();
  loadMotionSettings();
  loadNoMagicMode();
  loadImportResolution();

  const resetBtn = document.getElementById('reset-button');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToCamera);
  }
  
  const cameraBtn = document.getElementById('camera-button');
  if (cameraBtn) {
    cameraBtn.addEventListener('click', switchCamera);
  }
  
  const closeEditorBtn = document.getElementById('close-editor');
  if (closeEditorBtn) {
    closeEditorBtn.addEventListener('click', hideStyleEditor);
  }
  
  // Add scroll wheel support for style editor
//  const styleEditorBody = document.querySelector('.style-editor-body');
//  if (styleEditorBody) {
//    styleEditorBody.addEventListener('wheel', (e) => {
//      e.stopPropagation();
//      const delta = e.deltaY;
//      styleEditorBody.scrollTop += delta;
//    }, { passive: true });
//  }

  // Add scroll wheel support for style message textarea
//  const styleMessageTextarea = document.getElementById('style-message');
//  if (styleMessageTextarea) {
//    styleMessageTextarea.addEventListener('wheel', (e) => {
//      const atTop = styleMessageTextarea.scrollTop === 0;
//      const atBottom = styleMessageTextarea.scrollTop + styleMessageTextarea.clientHeight >= styleMessageTextarea.scrollHeight;
//    
    // Only allow scrolling within textarea if not at boundaries
//      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
//        e.stopPropagation();
//      }
//    }, { passive: true });
//  }

  const importResolutionBtn = document.getElementById('import-resolution-settings-button');
  if (importResolutionBtn) {
    importResolutionBtn.addEventListener('click', showImportResolutionSubmenu);
  }
  
  const importResolutionBackBtn = document.getElementById('import-resolution-back');
  if (importResolutionBackBtn) {
    importResolutionBackBtn.addEventListener('click', hideImportResolutionSubmenu);
  }
    
  const saveStyleBtn = document.getElementById('save-style');
  if (saveStyleBtn) {
    saveStyleBtn.addEventListener('click', saveStyle);
  }
  
  const deleteStyleBtn = document.getElementById('delete-style');
  if (deleteStyleBtn) {
    deleteStyleBtn.addEventListener('click', deleteStyle);
  }
  
  connectionStatusElement = document.getElementById('connection-status');
  queueStatusElement = document.getElementById('queue-status');
  syncButton = document.getElementById('sync-button');
  
  if (syncButton) {
    syncButton.addEventListener('click', syncQueuedPhotos);
  }
  
  if (queueStatusElement) {
    queueStatusElement.addEventListener('click', showQueueManager);
  }
  
  const closeQueueBtn = document.getElementById('close-queue-manager');
  if (closeQueueBtn) {
    closeQueueBtn.addEventListener('click', hideQueueManager);
  }
  
  const syncAllBtn = document.getElementById('sync-all');
  if (syncAllBtn) {
    syncAllBtn.addEventListener('click', syncQueuedPhotos);
  }
  
  const clearQueueBtn = document.getElementById('clear-queue');
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', clearQueue);
  }
  
  const galleryBtn = document.getElementById('gallery-button');
  if (galleryBtn) {
    galleryBtn.addEventListener('click', showGallery);
  }
  
  const closeGalleryBtn = document.getElementById('close-gallery');
  if (closeGalleryBtn) {
    closeGalleryBtn.addEventListener('click', hideGallery);
  }
  
  // Gallery Import Button
  const galleryImportBtn = document.getElementById('gallery-import-button');
  if (galleryImportBtn) {
    galleryImportBtn.addEventListener('click', () => {
      openQRScannerModal();
    });
  }

  // Check for updates button handler
  const checkUpdatesBtn = document.getElementById('check-updates-button');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', async () => {
      try {
        // Load presets from JSON
        const response = await fetch('./presets.json');
        if (!response.ok) {
          alert('Could not load presets.json');
          return;
        }
        
        const jsonPresets = await response.json();
        const importedPresets = presetImporter.getImportedPresets();
        
        if (importedPresets.length === 0) {
          alert('No presets imported yet. Use "Import Presets" first.');
          return;
        }
        
        // Check for updates and new presets
        let updatedCount = 0;
        let newCount = 0;
        
        const importedNames = new Set(importedPresets.map(p => p.name));
        
        jsonPresets.forEach(jsonPreset => {
          if (importedNames.has(jsonPreset.name)) {
            // Check if content is different (updated)
            const existing = importedPresets.find(p => p.name === jsonPreset.name);
            if (existing && existing.message !== jsonPreset.message) {
              updatedCount++;
            }
          } else {
            // New preset
            newCount++;
          }
        });
        
        if (updatedCount === 0 && newCount === 0) {
          alert('✅ All presets are up to date!');
          return;
        }
        
        // Show update prompt
        const updateMsg = [];
        if (updatedCount > 0) updateMsg.push(`${updatedCount} updated preset(s)`);
        if (newCount > 0) updateMsg.push(`${newCount} new preset(s)`);
        
        const shouldUpdate = await confirm(
          `Found ${updateMsg.join(' and ')} available.\n\n` +
          `Would you like to import updates now?`
        );
        
        if (shouldUpdate) {
          // Trigger import with all presets selected
const result = await presetImporter.import();
          
          if (result.success) {
            // Save preset names that existed BEFORE import (to detect truly new presets)
            const presetsBeforeImport = new Set(CAMERA_PRESETS.map(p => p.name));
            
            // Reload presets
            CAMERA_PRESETS = await mergePresetsWithStorage();
            
            // Clean up visible presets after reloading and add only NEW presets
            const validPresetNames = new Set(CAMERA_PRESETS.map(p => p.name));
            
            // Keep existing visible presets that are still valid
            visiblePresets = visiblePresets.filter(name => validPresetNames.has(name));
            
            // Add ONLY truly NEW presets (ones that didn't exist before import) as visible by default
            CAMERA_PRESETS.forEach(preset => {
              if (!presetsBeforeImport.has(preset.name) && !visiblePresets.includes(preset.name)) {
                visiblePresets.push(preset.name);
              }
            });
            
            saveVisiblePresets();
            
            // Update menu
            populateStylesList();
            updateVisiblePresetsDisplay();
            
            // Clear the update flag after successful import
            const statusElement = document.getElementById('updates-status');
            if (statusElement) {
              statusElement.textContent = 'Check for Updates';
              statusElement.style.color = '';
              statusElement.style.fontWeight = '';
            }
            
            alert(result.message);
          }
        }
      } catch (error) {
        alert('Error checking for updates: ' + error.message);
      }
    });
  }
  
  // QR Scanner Close Button
  const closeQRScannerBtn = document.getElementById('close-qr-scanner');
  if (closeQRScannerBtn) {
    closeQRScannerBtn.addEventListener('click', () => {
      closeQRScannerModal();
    });
  }

  const closeViewerBtn = document.getElementById('close-viewer');
  if (closeViewerBtn) {
    closeViewerBtn.addEventListener('click', closeImageViewer);
  }
  
  const deleteViewerBtn = document.getElementById('delete-viewer-image');
  if (deleteViewerBtn) {
    deleteViewerBtn.addEventListener('click', deleteViewerImage);
  }
  
  const uploadViewerBtn = document.getElementById('upload-viewer-image');
  if (uploadViewerBtn) {
    uploadViewerBtn.addEventListener('click', uploadViewerImage);
  }

  const mpViewerBtn = document.getElementById('mp-viewer-button');
  if (mpViewerBtn) {
    mpViewerBtn.addEventListener('click', () => {
      // Save current viewer image index
      savedViewerImageIndex = currentViewerImageIndex;
      
      // Close image viewer and gallery
      document.getElementById('image-viewer').style.display = 'none';
      document.getElementById('gallery-modal').style.display = 'none';
      
      // Set flag to return to gallery
      returnToGalleryFromMasterPrompt = true;
      
      // Open settings submenu first
      document.getElementById('unified-menu').style.display = 'flex';
      isMenuOpen = true;
      document.getElementById('settings-submenu').style.display = 'flex';
      isSettingsSubmenuOpen = true;
      
      // Use the proper function to show master prompt (loads values correctly)
      showMasterPromptSubmenu();
    });
  }
  
  // QR Scan Button
  const qrScanBtn = document.getElementById('qr-scan-button');
  if (qrScanBtn) {
    qrScanBtn.addEventListener('click', () => {
      const scanBtn = document.getElementById('qr-scan-button');
      const scannerVideo = document.getElementById('qr-scanner-video');
      
      if (scanBtn) {
        scanBtn.disabled = true;
      }
      
      // Start video playback when scan button is pressed
      if (scannerVideo && scannerVideo.paused) {
        scannerVideo.play();
      }
      
      updateQRScannerStatus('Scanning...', '');
      startQRDetection();
    });
  }

  const closeQrModalBtn = document.getElementById('close-qr-modal');
  if (closeQrModalBtn) {
    closeQrModalBtn.addEventListener('click', closeQrModal);
  }

  const startDateBtn = document.getElementById('gallery-start-date-btn');
  const startDateInput = document.getElementById('gallery-start-date');
  if (startDateBtn && startDateInput) {
    startDateBtn.addEventListener('click', () => {
      startDateInput.showPicker();
    });
    startDateInput.addEventListener('change', (e) => {
      galleryStartDate = e.target.value || null;
      updateDateButtonText('start', galleryStartDate);
      onGalleryFilterChange();
    });
  }
  
  const endDateBtn = document.getElementById('gallery-end-date-btn');
  const endDateInput = document.getElementById('gallery-end-date');
  if (endDateBtn && endDateInput) {
    endDateBtn.addEventListener('click', () => {
      endDateInput.showPicker();
    });
    endDateInput.addEventListener('change', (e) => {
      galleryEndDate = e.target.value || null;
      updateDateButtonText('end', galleryEndDate);
      onGalleryFilterChange();
    });
  }
  
  const sortOrderSelect = document.getElementById('gallery-sort-order');
  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', (e) => {
      gallerySortOrder = e.target.value;
      // Save sort order preference
      try {
        localStorage.setItem(GALLERY_SORT_ORDER_KEY, gallerySortOrder);
      } catch (err) {
        console.error('Failed to save sort order:', err);
      }
      onGalleryFilterChange();
    });
  }
  
  const prevPageBtn = document.getElementById('prev-page');
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', prevGalleryPage);
  }
  
  const nextPageBtn = document.getElementById('next-page');
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', nextGalleryPage);
  }
  
  const loadPresetBtn = document.getElementById('load-preset-button');
  if (loadPresetBtn) {
    loadPresetBtn.addEventListener('click', showPresetSelector);
  }
  
  const multiPresetBtn = document.getElementById('multi-preset-button');
  if (multiPresetBtn) {
    multiPresetBtn.addEventListener('click', () => {
      if (currentViewerImageIndex >= 0) {
        const imageId = galleryImages[currentViewerImageIndex].id;
        openMultiPresetSelector(imageId);
      }
    });
  }

  const closePresetSelectorBtn = document.getElementById('close-preset-selector');
  if (closePresetSelectorBtn) {
    closePresetSelectorBtn.addEventListener('click', hidePresetSelector);
  }
  
  const presetFilter = document.getElementById('preset-filter');
  if (presetFilter) {
    presetFilter.addEventListener('input', (e) => {
      presetFilterText = e.target.value;
      populatePresetList();
    });
    
    // Hide footer and controls when user starts typing (keyboard appears)
    presetFilter.addEventListener('focus', () => {
      isPresetFilterFocused = true;
      // Hide category footer
      const categoryHint = document.getElementById('preset-selector-category-hint');
      if (categoryHint) {
        categoryHint.style.display = 'none';
      }
      
      // Hide multi-preset controls if they exist
      const multiControls = document.getElementById('multi-preset-controls');
      if (multiControls) {
        multiControls.style.display = 'none';
      }
    });
    
    // Show them back when user is done typing (keyboard dismissed)
    presetFilter.addEventListener('blur', () => {
      isPresetFilterFocused = false;
      // Only restore multi-preset controls if we're in multi-preset mode
      if (isMultiPresetMode) {
        const multiControls = document.getElementById('multi-preset-controls');
        if (multiControls) {
          multiControls.style.display = 'flex';
        }
      }
      
      // Category footer will be restored by updatePresetSelection when needed
    });
  }
  
  const presetSelectorJumpUp = document.getElementById('preset-selector-jump-up');
  if (presetSelectorJumpUp) {
    presetSelectorJumpUp.addEventListener('click', () => {
      currentPresetIndex_Gallery = 0;
      updatePresetSelection();
    });
  }
  
  const presetSelectorJumpDown = document.getElementById('preset-selector-jump-down');
  if (presetSelectorJumpDown) {
    presetSelectorJumpDown.addEventListener('click', () => {
      const list = document.getElementById('preset-list');
      if (list) {
        const items = list.querySelectorAll('.preset-item');
        if (items.length > 0) {
          currentPresetIndex_Gallery = items.length - 1;
          updatePresetSelection();
        }
      }
    });
  }

  const magicBtn = document.getElementById('magic-button');
  if (magicBtn) {
    magicBtn.addEventListener('click', submitMagicTransform);
  }
  
  const batchModeToggle = document.getElementById('batch-mode-toggle');
  if (batchModeToggle) {
    batchModeToggle.addEventListener('click', toggleBatchMode);
  }

  const batchSelectAll = document.getElementById('batch-select-all');
  if (batchSelectAll) {
    batchSelectAll.addEventListener('click', selectAllBatchImages);
  }

  const batchDeselectAll = document.getElementById('batch-deselect-all');
  if (batchDeselectAll) {
    batchDeselectAll.addEventListener('click', deselectAllBatchImages);
  }

  const batchCancel = document.getElementById('batch-cancel');
  if (batchCancel) {
    batchCancel.addEventListener('click', toggleBatchMode);
  }

  const batchApplyPreset = document.getElementById('batch-apply-preset');
  if (batchApplyPreset) {
    batchApplyPreset.addEventListener('click', applyPresetToBatch);
  }

  const batchDelete = document.getElementById('batch-delete');
  if (batchDelete) {
    batchDelete.addEventListener('click', batchDeleteImages);
  }

  // Initialize IndexedDB and load gallery
  initDB().then(async () => {
    // Check if we need to migrate from localStorage
    const oldIndexJson = localStorage.getItem('r1_gallery_index');
    if (oldIndexJson) {
      console.log('Migrating old gallery data...');
      await migrateFromLocalStorage();
    } else {
      await loadGallery();
    }
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
  setupViewerPinchZoom();

});

// Make functions available globally for inline onclick handlers
window.removeFromQueue = removeFromQueue;
window.previewQueueItem = previewQueueItem;
window.clearQueue = clearQueue;

// Upload image to gofile.io
async function uploadViewerImage() {
  if (currentViewerImageIndex < 0) return;
  
  const statusElement = document.getElementById('status');
  const uploadBtn = document.getElementById('upload-viewer-image');
  
  try {
    // Disable button and show status
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳';
    if (statusElement) {
      statusElement.style.display = 'block';
      statusElement.textContent = 'Getting server...';
    }
    
    // Step 1: Get the best server from gofile.io
    const serverResponse = await fetch('https://api.gofile.io/servers');
    if (!serverResponse.ok) {
      throw new Error('Failed to get upload server');
    }
    const serverData = await serverResponse.json();
    
    if (serverData.status !== 'ok' || !serverData.data || !serverData.data.servers || serverData.data.servers.length === 0) {
      throw new Error('No upload servers available');
    }
    
    // Use the first available server
    const server = serverData.data.servers[0].name;
    
    if (statusElement) {
      statusElement.textContent = 'Uploading image...';
    }
    
    const imageData = galleryImages[currentViewerImageIndex];
    // Convert base64 to blob
    const base64Data = imageData.imageBase64.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    
    // Create form data for gofile.io
    const formData = new FormData();
    formData.append('file', blob, `magic-kamera-${Date.now()}.png`);
    
    // Step 2: Upload to the assigned server (no token needed for guest uploads)
    const uploadUrl = `https://${server}.gofile.io/uploadFile`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Upload failed - status: ' + response.status);
    }
    
    // gofile.io returns JSON with the download URL
    const result = await response.json();
    
    if (result.status !== 'ok' || !result.data || !result.data.downloadPage) {
      throw new Error('Upload failed: ' + (result.status || 'unknown error'));
    }
    
    const downloadUrl = result.data.downloadPage;
    
    if (statusElement) {
      statusElement.textContent = 'Upload successful!';
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 2000);
    }
    
    // Show QR code
    showQrCode(downloadUrl.trim());
    
  } catch (error) {
    console.error('Upload error:', error);
    if (statusElement) {
      statusElement.textContent = 'Upload failed: ' + error.message;
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 4000);
    }
  } finally {
    // Re-enable button
    uploadBtn.disabled = false;
    uploadBtn.textContent = '📤';
  }
}

// Show QR code modal
function showQrCode(url) {
  const qrModal = document.getElementById('qr-modal');
  const qrContainer = document.getElementById('qr-code-container');
  const qrUrlText = document.getElementById('qr-url-text');
  
  if (!qrModal || !qrContainer || !qrUrlText) return;
  
  // Clear previous QR code
  qrContainer.innerHTML = '';
  
  // Generate new QR code
  new QRCode(qrContainer, {
    text: url,
    width: 128,
    height: 128,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  
  // Set URL text
  qrUrlText.textContent = url;
  
  // Show modal
  qrModal.style.display = 'flex';
}

// Close QR code modal
function closeQrModal() {
  const qrModal = document.getElementById('qr-modal');
  if (qrModal) {
    qrModal.style.display = 'none';
  }
}

// Open QR Scanner Modal
function openQRScannerModal() {
  const scannerModal = document.getElementById('qr-scanner-modal');
  const scannerVideo = document.getElementById('qr-scanner-video');
  
  if (!scannerModal || !scannerVideo) return;
  
  // Show modal
  scannerModal.style.display = 'flex';
  
  // Start camera for QR scanning (but don't start detection yet)
  startQRScannerCamera();
  
  // Reset status
  updateQRScannerStatus('Ready to scan', '');
  
  // Enable scan button
  const scanBtn = document.getElementById('qr-scan-button');
  if (scanBtn) {
    scanBtn.disabled = false;
  }
}

// Close QR Scanner Modal
function closeQRScannerModal() {
  const scannerModal = document.getElementById('qr-scanner-modal');
  if (scannerModal) {
    scannerModal.style.display = 'none';
  }
  
  // Stop QR detection and camera
  stopQRDetection();
  stopQRScannerCamera();
  
  // Reset status
  updateQRScannerStatus('Point camera at QR code...', '');
}

// Start camera for QR scanner
async function startQRScannerCamera() {
  const scannerVideo = document.getElementById('qr-scanner-video');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    
    scannerVideo.srcObject = stream;
    
    // Pause the video until user presses scan button
    scannerVideo.onloadedmetadata = () => {
      scannerVideo.pause();
      updateQRScannerStatus('Ready to scan', '');
    };
  } catch (error) {
    console.error('Error starting QR scanner camera:', error);
    updateQRScannerStatus('Camera access denied', 'error');
  }
}

// Stop QR scanner camera
function stopQRScannerCamera() {
  const scannerVideo = document.getElementById('qr-scanner-video');
  
  if (scannerVideo && scannerVideo.srcObject) {
    const tracks = scannerVideo.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    scannerVideo.srcObject = null;
  }
}

// Update QR scanner status message
function updateQRScannerStatus(message, type = '') {
  const statusElement = document.getElementById('qr-scanner-status');
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = 'qr-scanner-status';
    if (type) {
      statusElement.classList.add(type);
    }
  }
}

// Show gallery status message
function showGalleryStatusMessage(message, type = 'info', duration = 3000) {
  const statusElement = document.getElementById('gallery-status-message');
  if (!statusElement) return;
  
  statusElement.textContent = message;
  statusElement.className = 'gallery-status-message';
  
  if (type === 'error') {
    statusElement.classList.add('error');
  } else if (type === 'success') {
    statusElement.classList.add('success');
  }
  
  statusElement.style.display = 'block';
  
  // Auto-hide after duration
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, duration);
}

function startQRDetection() {
  if (qrDetectionActive) return;
  
  qrDetectionActive = true;
  qrDetectionInterval = setInterval(detectQRCode, QR_DETECTION_INTERVAL);
}

// Stop QR code detection
function stopQRDetection() {
  qrDetectionActive = false;
  if (qrDetectionInterval) {
    clearInterval(qrDetectionInterval);
    qrDetectionInterval = null;
  }
  // Don't clear lastDetectedQR here - it's needed for import
  // It will be cleared after successful import in importFromQRCode()
}

// Detect QR code in video stream
function detectQRCode() {
  const scannerVideo = document.getElementById('qr-scanner-video');
  if (!scannerVideo || scannerVideo.readyState !== scannerVideo.HAVE_ENOUGH_DATA) return;
  
  const tempCanvas = document.createElement('canvas');
  const context = tempCanvas.getContext('2d');
  
  tempCanvas.width = scannerVideo.videoWidth;
  tempCanvas.height = scannerVideo.videoHeight;
  
  context.drawImage(scannerVideo, 0, 0, tempCanvas.width, tempCanvas.height);
  const imageData = context.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  
  // Use jsQR library to detect QR code
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  
  if (code && code.data) {
    // Check if it's a valid URL
    if (isValidURL(code.data)) {
      if (lastDetectedQR !== code.data) {
        lastDetectedQR = code.data;
        updateQRScannerStatus('QR Code detected! Importing...', 'success');
        
        // Stop scanning once QR is detected
        stopQRDetection();
        
        // Auto-import when QR code is detected
        setTimeout(() => {
          importFromQRCode();
        }, 500);
      }
    } else {
      stopQRDetection();
      closeQRScannerModal();
      showGalleryStatusMessage('Invalid QR code - must be a valid URL', 'error', 4000);
    }
  } else {
    updateQRScannerStatus('Scanning...', '');
  }
}

// Check if string is valid URL
function isValidURL(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Resize and compress image to match camera resolution settings
async function resizeAndCompressImage(blob, maxWidth = 640, maxHeight = 480, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        
        if (width > height) {
          width = maxWidth;
          height = width / aspectRatio;
        } else {
          height = maxHeight;
          width = height * aspectRatio;
        }
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to blob
      canvas.toBlob(
        (resizedBlob) => {
          if (resizedBlob) {
            resolve(resizedBlob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing'));
    };
    
    img.src = url;
  });
}

// Import image from QR code
async function importFromQRCode() {
  if (!lastDetectedQR) {
    closeQRScannerModal();
    showGalleryStatusMessage('No QR code detected', 'error', 3000);
    return;
  }
  
  try {
    updateQRScannerStatus('Downloading image...', '');
    
    const imageUrl = lastDetectedQR.trim();
    
    // Try multiple proxies in order
    const proxies = [
      'https://api.codetabs.com/v1/proxy?quest=',
      'https://corsproxy.io/?',
      'https://api.allorigins.win/raw?url=',
      '' // Try direct last
    ];
    
    let response = null;
    let lastError = null;
    
    for (let i = 0; i < proxies.length; i++) {
      try {
        const fetchUrl = proxies[i] ? proxies[i] + encodeURIComponent(imageUrl) : imageUrl;
        
        updateQRScannerStatus(`Trying method ${i + 1}/${proxies.length}...`, '');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        response = await fetch(fetchUrl, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          updateQRScannerStatus('Download successful!', 'success');
          break; // Success!
        }
      } catch (error) {
        lastError = error;
        continue; // Try next proxy
      }
    }
    
    if (!response || !response.ok) {
      throw new Error('All download methods failed');
    }
    
    updateQRScannerStatus('Reading image data...', '');
    
    let blob = await response.blob();
    
    const originalSize = Math.round(blob.size / 1024);
    updateQRScannerStatus('Original size: ' + originalSize + 'KB', '');
    
    // Check if it's an image
    if (blob.type && !blob.type.startsWith('image/')) {
      throw new Error('Not an image: ' + blob.type);
    }
    
    // Resize/compress large images to match camera capabilities
    // Use UXGA (1600x1200) as max to balance quality and storage
    updateQRScannerStatus('Optimizing image...', '');
    
    // Use user's selected import resolution
    const importRes = IMPORT_RESOLUTION_OPTIONS[currentImportResolutionIndex];
    blob = await resizeAndCompressImage(blob, importRes.width, importRes.height, 0.85);
    
    const newSize = Math.round(blob.size / 1024);
    updateQRScannerStatus('Compressed: ' + originalSize + 'KB → ' + newSize + 'KB', '');
    
    updateQRScannerStatus('Converting to base64...', '');
    
    // Convert to base64 with timeout protection
    const base64Data = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Base64 conversion timeout'));
      }, 10000);
      
      const reader = new FileReader();
      
      reader.onloadend = () => {
        clearTimeout(timeout);
        resolve(reader.result);
      };
      
      reader.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('FileReader error'));
      };
      
      reader.readAsDataURL(blob);
    });
    
    updateQRScannerStatus('Saving to gallery...', '');
    
    // Save to gallery
    const imageData = {
      id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      imageBase64: base64Data,
      timestamp: Date.now()
    };
    
    // Add to memory array
    galleryImages.unshift(imageData);
    
    // Save to IndexedDB
    await saveImageToDB(imageData);
    
    updateQRScannerStatus('✅ Import successful!', 'success');
      
    lastDetectedQR = null;
    
    // Close scanner modal after successful import
    closeQRScannerModal();
    
    // Refresh gallery to show new image and show success message
    await showGallery();
    showGalleryStatusMessage('Image imported successfully!', 'success', 3000);
    
  } catch (error) {
    lastDetectedQR = null;
    
    // Close modal and show error in gallery
    closeQRScannerModal();
    showGalleryStatusMessage('Import failed: ' + error.message, 'error', 4000);
  }
}

// Database reset handler - clears ALL modifications and custom presets
document.getElementById('factory-reset-button').addEventListener('click', async () => {
  const message = hasImportedPresets 
    ? 'This will delete ALL custom presets and undo ALL modifications, returning to your clean imported preset list. This cannot be undone. Continue?'
    : 'This will delete ALL custom presets and restore all presets to their original state. This cannot be undone. Continue?';
  
  if (await confirm(message)) {
    // Clear ALL records from preset storage (modifications, deletions, AND custom presets)
    await presetStorage.clearAll();
    
    // Reload presets from imported list or factory presets
    CAMERA_PRESETS = await mergePresetsWithStorage();
    
    // Reset visible presets to show everything (fresh start)
    if (CAMERA_PRESETS.length > 0) {
        visiblePresets = CAMERA_PRESETS.map(p => p.name);
        saveVisiblePresets();
    }
    
    renderMenuStyles();
    
    const successMessage = hasImportedPresets
      ? 'All custom presets deleted and modifications cleared. Reset to imported presets!'
      : 'All custom presets deleted and modifications cleared!';
    alert(successMessage);
  }
});

// Carousel infinite scroll logic
document.addEventListener('DOMContentLoaded', function() {
  const carousel = document.querySelector('.mode-carousel-track');
  
  if (carousel) {
    
// Re-attach event listeners to cloned buttons
    const allButtons = carousel.querySelectorAll('.mode-button');
    allButtons.forEach(button => {
      const mode = button.getAttribute('data-mode');
      if (mode === 'random') {
        button.addEventListener('click', toggleRandomMode);
      } else if (mode === 'motion') {
        button.addEventListener('click', toggleMotionDetection);
      } else if (mode === 'burst') {
        button.addEventListener('click', toggleBurstMode);
      } else if (mode === 'timer') {
        button.addEventListener('click', toggleTimerMode);
      }
    });
  }
});

console.log('AI Camera Styles app initialized!');

// --- Swipe Detection for Mode Carousel ---
let touchStartX = 0;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX; // Positive = Swipe Left
    const carousel = document.querySelector('.mode-carousel');

    if (!carousel) return;

    const swipeThreshold = 30; 
    // Detects if swipe starts on the right 40% of screen
    const edgeZone = window.innerWidth * 0.5; 

    // SHOW MENU: Swipe Left
    if (touchStartX > edgeZone && diffX > swipeThreshold) {
        carousel.classList.add('show');
    }

    // HIDE MENU: Swipe Right
    if (diffX < -swipeThreshold) {
        carousel.classList.remove('show');
    }
}, { passive: true });