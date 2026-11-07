// PT 일일현황 병원 접속 암호 잠금 및 인증 관리 (PTClinicAuth)
(function() {
  const AUTH_STORAGE_KEY = 'PT_CLINIC_ACCESS_AUTH_V1';
  const PASSWORD_STORAGE_KEY = 'PT_CLINIC_PASSWORD_V1';
  const DEFAULT_PASSWORD = '1';

  const PTClinicAuth = {
    AUTH_STORAGE_KEY,
    PASSWORD_STORAGE_KEY,
    DEFAULT_PASSWORD,

    getPassword() {
      try {
        const stored = localStorage.getItem(PASSWORD_STORAGE_KEY);
        if (stored && typeof stored === 'string') return stored;
      } catch (_) {}
      return DEFAULT_PASSWORD;
    },

    setPassword(newPassword) {
      if (typeof newPassword !== 'string' || !newPassword.trim()) return false;
      try {
        localStorage.setItem(PASSWORD_STORAGE_KEY, newPassword.trim());
        return true;
      } catch (_) {
        return false;
      }
    },

    isUnlocked() {
      try {
        return localStorage.getItem(AUTH_STORAGE_KEY) === 'unlocked';
      } catch (_) {
        return false;
      }
    },

    unlock(inputPassword) {
      const currentPw = this.getPassword();
      if (String(inputPassword || '').trim() === currentPw) {
        try {
          localStorage.setItem(AUTH_STORAGE_KEY, 'unlocked');
        } catch (_) {}
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.classList.remove('clinic-locked');
          const modal = document.getElementById('clinicLoginModal');
          if (modal) modal.style.display = 'none';
          const err = document.getElementById('clinicLoginError');
          if (err) err.style.display = 'none';
          const input = document.getElementById('clinicPasswordInput');
          if (input) input.value = '';
        }

        if (typeof window !== 'undefined' && window.ptApp && typeof window.ptApp.focusActiveCell === 'function') {
          try { window.ptApp.focusActiveCell(); } catch (_) {}
        }
        return true;
      }
      return false;
    },

    lock() {
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch (_) {}
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.add('clinic-locked');
        const modal = document.getElementById('clinicLoginModal');
        if (modal) modal.style.display = 'flex';
        const input = document.getElementById('clinicPasswordInput');
        if (input) {
          input.value = '';
          setTimeout(() => {
            try { input.focus(); } catch (_) {}
          }, 50);
        }
        const err = document.getElementById('clinicLoginError');
        if (err) err.style.display = 'none';
      }
    },

    initUI() {
      if (typeof document === 'undefined') return;

      const modal = document.getElementById('clinicLoginModal');
      const form = document.getElementById('clinicLoginForm');
      const input = document.getElementById('clinicPasswordInput');
      const submitBtn = document.getElementById('btnClinicLogin');
      const errorMsg = document.getElementById('clinicLoginError');
      const lockBtn = document.getElementById('btnClinicLock');

      const handleAttempt = () => {
        if (!input) return;
        const val = input.value;
        if (this.unlock(val)) {
          if (errorMsg) errorMsg.style.display = 'none';
        } else {
          if (errorMsg) {
            errorMsg.textContent = '비밀번호가 올바르지 않습니다.';
            errorMsg.style.display = 'block';
          }
          try { input.select(); } catch (_) {}
        }
      };

      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          handleAttempt();
        });
      }

      if (submitBtn && !form) {
        submitBtn.addEventListener('click', handleAttempt);
      }

      if (input) {
        input.addEventListener('input', () => {
          if (errorMsg && errorMsg.style.display !== 'none') {
            errorMsg.style.display = 'none';
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAttempt();
          }
        });
      }

      if (lockBtn) {
        lockBtn.addEventListener('click', () => {
          this.lock();
        });
      }

      if (this.isUnlocked()) {
        document.documentElement.classList.remove('clinic-locked');
        if (modal) modal.style.display = 'none';
      } else {
        document.documentElement.classList.add('clinic-locked');
        if (modal) modal.style.display = 'flex';
        if (input) {
          setTimeout(() => {
            try { input.focus(); } catch (_) {}
          }, 60);
        }
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.PTClinicAuth = PTClinicAuth;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PTClinicAuth;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => PTClinicAuth.initUI());
    } else {
      PTClinicAuth.initUI();
    }
  }
})();
