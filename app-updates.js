// Release detection, service-worker lifecycle and safe reload live in one module.
// Change releases with: node scripts/set-release-version.mjs vNNN
class PTAppUpdates {
  static VERSION = "v471";

  announceAvailableUpdate(version) {
    if (version) this.latestServerVersion = version;
    this.isUpdateAvailable = true;
    window.dispatchEvent(new CustomEvent("pt-app-update-available", {
      detail: { waiting: true, version: this.latestServerVersion, currentVersion: this.appVersion }
    }));
  }

  checkForUpdate() {
    if (this._updateCheck) return this._updateCheck;
    this._updateCheck = this.performUpdateCheck().finally(() => { this._updateCheck = null; });
    return this._updateCheck;
  }

  async performUpdateCheck() {
    this.updateCheckError = null;
    try {
      const response = await fetch("./version.json?_t=" + Date.now(), {
        cache: "no-store", signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const info = await response.json();
      if (!/^v\d+$/.test(info?.version)) throw new Error("버전 정보를 확인할 수 없습니다.");
      if (Number(info.version.slice(1)) > Number(this.appVersion.slice(1))) this.announceAvailableUpdate(info.version);
      this.lastUpdateCheckedAt = Date.now();
    } catch (error) { this.updateCheckError = error; }
    try {
      if ("serviceWorker" in navigator) {
        const reg = this.swRegistration || await navigator.serviceWorker.getRegistration();
        if (reg) {
          this.swRegistration = reg;
          await reg.update();
          if (reg.waiting) this.announceAvailableUpdate();
        }
      }
    } catch (error) { this.updateCheckError ||= error; }
    window.dispatchEvent(new CustomEvent("pt-app-update-checked"));
    return Boolean(this.isUpdateAvailable);
  }

  async prepareUpdateReload() {
    if (this._recordsRestorePending || this._recordRestoreError) throw new Error("기록 복원이 끝난 뒤 다시 업데이트해 주세요.");
    await this.syncBaselinesReady;
    await this.deviceSettingsReady;
    document.activeElement?.blur?.();
    clearTimeout(this._saveTimer);
    await this.persistDataStore();
    if (this.syncBaselines) await this.persistSyncBaselines();
    this.flushDevicePanelStates?.();
    await this.retryDeviceSettingsWrites?.();
    await window.ptLocalTools?._queueSettingsDisk?.();
    await Promise.all([this._recordWrite, this._baselineWrite, this.summaryStateWrite, this.toolbarStateWrite, this.columnWidthsWrite, this.devicePreferencesWrite, window.ptLocalTools?._settingsDiskWrite]);
  }

  async reloadUpdatedApp() {
    if (this._updateReloadPromise) return this._updateReloadPromise;
    this._updateReloadPromise = this.prepareUpdateReload().then(() => {
      window.location.reload();
    }).catch(error => {
      this._updateReloadPromise = null;
      this.showSaveIndicator("저장하지 못해 업데이트를 중단했습니다. 다시 시도해 주세요.", true);
      throw error;
    });
    return this._updateReloadPromise;
  }

  // Wait for installation/activation, rather than racing a fixed 300–600ms timer.
  waitForUpdateWorker(worker, states) {
    return new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        worker.removeEventListener("statechange", changed);
        if (error) reject(error); else resolve();
      };
      const changed = () => {
        if (states.includes(worker.state)) finish();
        else if (worker.state === "redundant") finish(new Error("업데이트 설치에 실패했습니다. 다시 확인해 주세요."));
      };
      const timer = setTimeout(() => finish(new Error("업데이트 준비가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.")), 20000);
      worker.addEventListener("statechange", changed);
      changed();
    });
  }

  applyUpdate() {
    if (this._applyingUpdate) return this._applyingUpdate;
    this._applyingUpdate = this.performUpdateApply().finally(() => { this._applyingUpdate = null; });
    return this._applyingUpdate;
  }

  async performUpdateApply() {
    try {
      // Finish editor commits and verified local writes before replacing the document.
      await this.prepareUpdateReload();
      if ("serviceWorker" in navigator) {
        const reg = this.swRegistration || await navigator.serviceWorker.getRegistration();
        if (!reg) throw new Error("업데이트 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.");
        const controller = navigator.serviceWorker.controller;
        await reg.update();
        const worker = reg.waiting || reg.installing;
        if (!worker && navigator.serviceWorker.controller !== controller) return this.reloadUpdatedApp();
        if (!worker) throw new Error("업데이트 파일이 아직 준비되지 않았습니다. 업데이트 확인 후 다시 시도해 주세요.");
        await this.waitForUpdateWorker(worker, ["installed", "activating", "activated"]);
        if (worker.state === "installed") worker.postMessage({ type: "SKIP_WAITING" });
        await this.waitForUpdateWorker(worker, ["activated"]);
      }
      await this.reloadUpdatedApp();
    } catch (error) {
      this.showSaveIndicator(error.message || "업데이트를 적용하지 못했습니다. 다시 시도해 주세요.", true);
      throw error;
    }
  }

  initPWA() {
    const flush = () => this.flushDevicePanelStates?.();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    if (!("serviceWorker" in navigator)) return;
    // First installation needs no reload. A change activated by another tab does.
    let controlled = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (controlled && !this._applyingUpdate) void this.reloadUpdatedApp().catch(() => {});
      controlled = true;
    });
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
        this.swRegistration = reg;
        window.ptSwRegistration = reg;
        const watchInstalling = () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) this.announceAvailableUpdate();
          });
        };
        if (reg.waiting) this.announceAvailableUpdate();
        watchInstalling();
        reg.addEventListener("updatefound", watchInstalling);
        const check = () => { void this.checkForUpdate(); };
        // Older releases reload with this marker before their worker finishes
        // installing. Complete that already-requested update once after recovery.
        const legacyApplyRequested = /(?:[?&])_(?:v|reload)=/.test(window.location.search || "");
        await this.checkForUpdate();
        if (legacyApplyRequested) {
          const url = new URL(window.location.href);
          url.searchParams.delete("_v");
          url.searchParams.delete("_reload");
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
          if (reg.waiting || reg.installing) {
            try {
              await this.syncBaselinesReady;
              await this.applyUpdate();
            } catch (error) { this.updateCheckError = error; }
          }
        }
        this._updateInterval = setInterval(check, 30000);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
        for (const event of ["focus", "pageshow", "online"]) window.addEventListener(event, check);
      } catch (error) { this.updateCheckError = error; }
    };
    if (["complete", "interactive"].includes(document.readyState)) void register();
    else window.addEventListener("load", register, { once: true });
  }
}
