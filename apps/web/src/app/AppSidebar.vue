<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import logoUrl from '@/assets/almasampler-logo.png';
import googleLogoUrl from '@/assets/google-logo.png';
import supportGifUrl from '@/assets/support-popup.gif';
import { useAuthStore } from '@/entities/auth/auth.store';
import { useProjectStore } from '@/entities/project/project.store';
import { useToastStore } from '@/shared/ui/toast.store';

const authStore = useAuthStore();
const projectStore = useProjectStore();
const toastStore = useToastStore();
const { errorMessage, isAuthenticated, isLoading, user } = storeToRefs(authStore);
const { projectName, hasLoadedSample, canEditProject, isReadOnlySharedProject } = storeToRefs(projectStore);
const isMenuOpen = ref(false);
const isSupportOpen = ref(false);
const isDeleteConfirmOpen = ref(false);

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

async function shareProject() {
  try {
    const shareUrl = await projectStore.createShareLink();

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      toastStore.show('Share link copied');
      return;
    }

    window.prompt('Copy project link', shareUrl);
  } catch (error) {
    toastStore.show(error instanceof Error ? error.message : 'Failed to create share link.');
  }
}

function openDeleteConfirm() {
  isDeleteConfirmOpen.value = true;
}

function closeDeleteConfirm() {
  isDeleteConfirmOpen.value = false;
}

async function confirmDeleteProject() {
  try {
    await projectStore.deleteProject();
    toastStore.show('Project deleted');
    isDeleteConfirmOpen.value = false;
  } catch (error) {
    toastStore.show(error instanceof Error ? error.message : 'Failed to delete project.');
  }
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

    <section v-if="isAuthenticated || isReadOnlySharedProject" class="app-sidebar__projects" aria-label="Projects">
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

      <div class="app-sidebar__project-card app-sidebar__project-card--active">
        <span>{{ hasLoadedSample ? projectName : 'Untitled Project' }}</span>
        <div v-if="isAuthenticated && canEditProject" class="app-sidebar__project-actions">
          <button
            class="app-sidebar__project-action app-sidebar__project-action--share"
            type="button"
            :disabled="!hasLoadedSample"
            title="Share project"
            aria-label="Share project"
            @click="shareProject"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M10.6 13.4a4 4 0 0 1 0-5.7l2-2a4 4 0 0 1 5.7 5.7l-1.3 1.3M13.4 10.6a4 4 0 0 1 0 5.7l-2 2a4 4 0 1 1-5.7-5.7l1.3-1.3"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.9"
              />
            </svg>
          </button>
          <button
            class="app-sidebar__project-action app-sidebar__project-action--delete"
            type="button"
            title="Delete project"
            aria-label="Delete project"
            @click="openDeleteConfirm"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 4h6M5 7h14M8 7v11m4-11v11m4-11v11M7 7l.8 12h8.4L17 7"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.9"
              />
            </svg>
          </button>
        </div>
      </div>

      <p v-if="isReadOnlySharedProject" class="app-sidebar__shared-state">
        Shared view. Pads and last take are playable, editing is locked.
      </p>
    </section>

    <footer class="app-sidebar__footer">
      <button class="app-sidebar__support" type="button" @click="openSupport">
        Contact / Support
      </button>

      <p v-if="!isAuthenticated && !isReadOnlySharedProject" class="app-sidebar__guest-hint">
        If you want to save and share your project, sign in with your Google email.
      </p>

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
          :title="isLoading ? 'Connecting Google account' : 'Sign in with Google'"
          :aria-label="isLoading ? 'Connecting Google account' : 'Sign in with Google'"
          @click="login"
        >
          <span v-if="isLoading">Connecting...</span>
          <img v-else :src="googleLogoUrl" alt="" class="app-sidebar__login-logo" />
        </button>
      </div>

      <p v-if="errorMessage" class="app-sidebar__auth-error">
        {{ errorMessage }}
      </p>
    </footer>
  </aside>

  <div
    v-if="isDeleteConfirmOpen"
    class="support-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-project-title"
    @click.self="closeDeleteConfirm"
  >
    <div class="support-modal__card">
      <button class="support-modal__close" type="button" @click="closeDeleteConfirm">
        Close
      </button>

      <div class="support-modal__copy">
        <h3 id="delete-project-title">Delete project?</h3>
        <p>
          This will remove the current project, sample file, saved slices and last take from your account.
        </p>
        <div class="support-modal__actions">
          <button class="ghost-action-button" type="button" @click="closeDeleteConfirm">
            Cancel
          </button>
          <button class="app-sidebar__danger-button" type="button" @click="confirmDeleteProject">
            Delete project
          </button>
        </div>
      </div>
    </div>
  </div>

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
