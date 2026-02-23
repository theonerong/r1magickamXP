// storage.js - IndexedDB management for preset persistence
// NEW ARCHITECTURE:
// - factory_presets: Cached from presets.json (read-only cache)
// - user_presets: User-created/modified presets (primary storage)

const DB_NAME = 'CameraPresetsDB';
const DB_VERSION = 2; // Incremented for new schema
const FACTORY_STORE_NAME = 'factory_presets';
const USER_STORE_NAME = 'user_presets';
const META_STORE_NAME = 'metadata';

// Legacy store names for migration
const LEGACY_STORE_NAME = 'presets';
const LEGACY_DB_NAME = 'CameraPresetsDB';
const LEGACY_DB_VERSION = 1;

class PresetStorage {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create factory_presets store (read-only cache)
        if (!db.objectStoreNames.contains(FACTORY_STORE_NAME)) {
          db.createObjectStore(FACTORY_STORE_NAME, { keyPath: 'id' });
        }
        
        // Create user_presets store (user-created/modified presets)
        if (!db.objectStoreNames.contains(USER_STORE_NAME)) {
          const userStore = db.createObjectStore(USER_STORE_NAME, { keyPath: 'id' });
          userStore.createIndex('name', 'name', { unique: false });
          userStore.createIndex('internal', 'internal', { unique: false });
        }
        
        // Create metadata store (migration status, version info)
        if (!db.objectStoreNames.contains(META_STORE_NAME)) {
          db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  // ========== FACTORY PRESETS ==========
  
  async getFactoryPresets() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([FACTORY_STORE_NAME], 'readonly');
      const store = transaction.objectStore(FACTORY_STORE_NAME);
      const request = store.get('cached');
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.presets || []);
        } else {
          resolve([]);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setFactoryPresets(presets) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([FACTORY_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(FACTORY_STORE_NAME);
      
      const request = store.put({
        id: 'cached',
        presets: presets,
        cachedAt: Date.now(),
        version: this._getFileVersion(presets)
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async hasFactoryPresetsCache() {
    const presets = await this.getFactoryPresets();
    return presets.length > 0;
  }

  // ========== USER PRESETS ==========

  async getUserPresets() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(USER_STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        // Return all user presets (internal: false)
        const userPresets = (request.result || []).filter(p => p.internal === false);
        resolve(userPresets);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setUserPresets(presets) {
    await this.init();
    
    return new Promise(async (resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(USER_STORE_NAME);
      
      // Clear existing user presets
      await new Promise((res, rej) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => res();
        clearRequest.onerror = () => rej(clearRequest.error);
      });
      
      // Add all new user presets with internal: false
      for (const preset of presets) {
        await new Promise((res, rej) => {
          const addRequest = store.put({
            ...preset,
            internal: false
          });
          addRequest.onsuccess = () => res();
          addRequest.onerror = () => rej(addRequest.error);
        });
      }
      
      resolve();
    });
  }

  async addUserPreset(preset) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(USER_STORE_NAME);
      
      const request = store.put({
        ...preset,
        id: preset.id || `user_${preset.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        internal: false,
        createdAt: Date.now()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateUserPreset(presetId, updates) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(USER_STORE_NAME);
      
      // First get existing preset
      const getRequest = store.get(presetId);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          reject(new Error('Preset not found'));
          return;
        }
        
        // Update and save
        const updated = { ...existing, ...updates, updatedAt: Date.now() };
        const putRequest = store.put(updated);
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteUserPreset(presetId) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(USER_STORE_NAME);
      
      const request = store.delete(presetId);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getUserPresetByName(name) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(USER_STORE_NAME);
      const index = store.index('name');
      const request = index.get(name);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // ========== BACKWARD COMPATIBLE METHODS (for legacy code) ==========
  // These methods exist for compatibility with existing main.js code

  // Legacy: save new preset (now adds to user_presets)
  async saveNewPreset(preset) {
    return this.addUserPreset({
      ...preset,
      id: preset.id || `user_${preset.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
    });
  }

  // Legacy: save modification (stores as user preset override)
  async saveModification(presetName, modifiedData) {
    const existing = await this.getUserPresetByName(presetName);
    if (existing) {
      return this.updateUserPreset(existing.id, modifiedData);
    } else {
      return this.addUserPreset({
        id: `user_${presetName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        name: presetName,
        ...modifiedData,
        internal: false,
        isModification: true,
        originalPreset: presetName
      });
    }
  }

  // Legacy: save deletion (marks preset as deleted)
  async saveDeletion(presetName) {
    const existing = await this.getUserPresetByName(presetName);
    if (existing) {
      return this.updateUserPreset(existing.id, { deleted: true });
    } else {
      return this.addUserPreset({
        id: `deleted_${presetName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
        name: presetName,
        internal: false,
        deleted: true
      });
    }
  }

  // Legacy: get all modifications
  async getAllModifications() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([USER_STORE_NAME], 'readonly');
      const store = transaction.objectStore(USER_STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Legacy: remove modification
  async removeModification(presetName) {
    const existing = await this.getUserPresetByName(presetName);
    if (existing) {
      return this.deleteUserPreset(existing.id);
    }
  }

  // ========== MIGRATION ==========

  async getMigrationStatus() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([META_STORE_NAME], 'readonly');
      const store = transaction.objectStore(META_STORE_NAME);
      const request = store.get('migration_complete');
      
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : false);
      };
      request.onerror = () => resolve(false);
    });
  }

  async setMigrationComplete() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(META_STORE_NAME);
      
      const request = store.put({
        key: 'migration_complete',
        value: true,
        migratedAt: Date.now()
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Main migration function - call on app init
  async migrateLegacyData() {
    // Check if migration already completed
    const migrationComplete = await this.getMigrationStatus();
    if (migrationComplete) {
      console.log('Migration already completed, skipping...');
      return { migrated: false, count: 0 };
    }
    
    console.log('Starting legacy data migration...');
    let migratedCount = 0;
    
    try {
      // 1. Check localStorage for legacy presets
      const localStoragePresets = this._checkLocalStorageLegacy();
      if (localStoragePresets.length > 0) {
        console.log(`Found ${localStoragePresets.length} presets in localStorage`);
        for (const preset of localStoragePresets) {
          await this.addUserPreset(preset);
          migratedCount++;
        }
      }
      
      // 2. Check for old IndexedDB structure
      const oldIDBPresets = await this._checkOldIndexedDB();
      if (oldIDBPresets.length > 0) {
        console.log(`Found ${oldIDBPresets.length} presets in old IndexedDB`);
        for (const preset of oldIDBPresets) {
          await this.addUserPreset(preset);
          migratedCount++;
        }
      }
      
      // Mark migration as complete
      await this.setMigrationComplete();
      console.log(`Migration complete: ${migratedCount} presets migrated`);
      
      return { migrated: true, count: migratedCount };
    } catch (error) {
      console.error('Migration error:', error);
      return { migrated: false, count: migratedCount, error };
    }
  }

  _checkLocalStorageLegacy() {
    const presets = [];
    
    // Check for various legacy localStorage keys
    const legacyKeys = [
      'r1_camera_styles',
      'camera_presets', 
      'customPresets',
      'storedStyles'
    ];
    
    for (const key of legacyKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          const parsedArray = Array.isArray(parsed) ? parsed : [parsed];
          
          for (const preset of parsedArray) {
            if (preset && preset.name) {
              presets.push({
                id: `migrated_${preset.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: preset.name,
                message: preset.message || preset.prompt || '',
                category: preset.category || ['MIGRATED'],
                options: preset.options || [],
                randomizeOptions: preset.randomizeOptions || false,
                internal: false,
                migrated: true,
                migratedFrom: key
              });
            }
          }
          
          // Remove old key after successful migration
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`Failed to parse localStorage.${key}:`, e);
        }
      }
    }
    
    return presets;
  }

  _checkOldIndexedDB() {
    return new Promise(async (resolve) => {
      const presets = [];
      
      try {
        // Try to open old database
        const oldDB = await new Promise((res, rej) => {
          const req = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
          req.onsuccess = () => res(req.result);
          req.onerror = () => res(null);
        });
        
        if (oldDB && oldDB.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          const transaction = oldDB.transaction([LEGACY_STORE_NAME], 'readonly');
          const store = transaction.objectStore(LEGACY_STORE_NAME);
          const request = store.getAll();
          
          request.onsuccess = () => {
            const records = request.result || [];
            
            for (const record of records) {
              // Only migrate 'new' type presets (user-created)
              if (record.type === 'new' && record.data) {
                presets.push({
                  id: `migrated_${record.data.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: record.data.name,
                  message: record.data.message || record.data.prompt || '',
                  category: record.data.category || ['MIGRATED'],
                  options: record.data.options || [],
                  randomizeOptions: record.data.randomizeOptions || false,
                  internal: false,
                  migrated: true,
                  migratedFrom: 'CameraPresetsDB.presets'
                });
              }
            }
            
            // Delete old database after reading
            indexedDB.deleteDatabase(LEGACY_DB_NAME);
            
            resolve(presets);
          };
          
          request.onerror = () => {
            indexedDB.deleteDatabase(LEGACY_DB_NAME);
            resolve(presets);
          };
        } else {
          resolve(presets);
        }
      } catch (e) {
        console.warn('Could not check old IndexedDB:', e);
        resolve(presets);
      }
    });
  }

  // ========== UTILITY ==========

  _getFileVersion(presets) {
    // Generate a simple version based on preset count and names
    const names = presets.map(p => p.name).sort().join(',');
    let hash = 0;
    for (let i = 0; i < names.length; i++) {
      const char = names.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  async getFactoryCacheVersion() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([FACTORY_STORE_NAME], 'readonly');
      const store = transaction.objectStore(FACTORY_STORE_NAME);
      const request = store.get('cached');
      
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.version || null);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Clear all data (for testing/reset)
  async clearAll() {
    await this.init();
    
    const stores = [FACTORY_STORE_NAME, USER_STORE_NAME, META_STORE_NAME];
    
    for (const storeName of stores) {
      await new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }
}

export const presetStorage = new PresetStorage();
