<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import logoUrl from '@/assets/almasampler-logo.png';
import supportGifUrl from '@/assets/support-popup.gif';
import { useAuthStore } from '@/entities/auth/auth.store';
import { useProjectStore } from '@/entities/project/project.store';

const authStore = useAuthStore();
const projectStore = useProjectStore();
const { errorMessage, isAuthenticated, isLoading, user } = storeToRefs(authStore);
const { projectName, hasLoadedSample } = storeToRefs(projectStore);
const isMenuOpen = ref(false);
const isSupportOpen = ref(false);

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}

function openSupport() {
  isSupportOpen.value = true;
  isMenuOpen.value = false;
}

async function login() {
  const didLogin = await authStore.loginWithGoogle();

  if (didLogin) {
    isMenuOpen.value = false;
  }
}

function logout() {
  authStore.logout();
}
</script>

<template>
  <button
    class="app-sidebar__burger"
    type="button"
    aria-label="Open menu"
    title="Open menu"
    @click="toggleMenu"
  >
    <span />
    <span />
    <span />
  </button>

  <div
    v-if="isMenuOpen"
    class="app-sidebar__scrim"
    @click="isMenuOpen = false"
  />

  <aside class="app-sidebar" :class="{ 'app-sidebar--open': isMenuOpen }">
    <div class="app-sidebar__logo">
      <img :src="logoUrl" alt="Almasampler" class="app-sidebar__logo-image" />
    </div>

    <section class="app-sidebar__projects" aria-label="Projects">
      <div class="app-sidebar__projects-header">
        <h2>Projects</h2>
        <button
          class="app-sidebar__project-add"
          type="button"
          disabled
          title="Multiple projects will be added later"
          aria-label="Add project"
        >
          +
        </button>
      </div>

      <div class="app-sidebar__divider" />

      <button class="app-sidebar__project-card app-sidebar__project-card--active" type="button">
        <span>{{ hasLoadedSample ? projectName : 'Untitled Project' }}</span>
      </button>
    </section>

    <footer class="app-sidebar__footer">
      <button class="app-sidebar__support" type="button" @click="openSupport">
        Contact / Support
      </button>

      <div class="app-sidebar__auth">
        <template v-if="isAuthenticated">
          <div class="app-sidebar__user">
            <img
              v-if="user?.avatarUrl"
              :src="user.avatarUrl"
              alt=""
              class="app-sidebar__avatar"
            />
            <span>{{ user?.name || user?.email }}</span>
          </div>
          <button
            class="app-sidebar__logout"
            type="button"
            title="Logout"
            aria-label="Logout"
            @click="logout"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3h9a1 1 0 0 1 1 1v3h-2V5H7v14h6v-2h2v3a1 1 0 0 1-1 1H5V3Z" />
              <path d="M16.6 7.4 21.2 12l-4.6 4.6-1.4-1.4 2.2-2.2H10v-2h7.4l-2.2-2.2 1.4-1.4Z" />
            </svg>
          </button>
        </template>
        <button
          v-else
          class="app-sidebar__login"
          type="button"
          :disabled="isLoading"
          @click="login"
        >
          {{ isLoading ? 'Connecting...' : 'Google acc' }}
        </button>
      </div>

      <p v-if="errorMessage" class="app-sidebar__auth-error">
        {{ errorMessage }}
      </p>
    </footer>
  </aside>

  <div
    v-if="isSupportOpen"
    class="support-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="support-modal-title"
    @click.self="isSupportOpen = false"
  >
    <div class="support-modal__card">
      <button class="support-modal__close" type="button" @click="isSupportOpen = false">
        Close
      </button>

      <img :src="supportGifUrl" alt="Support gif" class="support-modal__gif" />

      <div class="support-modal__copy">
        <h3 id="support-modal-title">Hey friend</h3>
        <p>
          If you enjoyed the project and want to support the author, or if you have any
          feedback, send an email to
          <a href="mailto:oneera.pro@gmail.com">oneera.pro@gmail.com</a>.
        </p>
        <p class="support-modal__donate">
          Want to donate directly?
          <a href="https://boosty.to/onlyoneera/donate" target="_blank" rel="noreferrer">
            Support on Boosty
          </a>
        </p>
      </div>
    </div>
  </div>
</template>
