import { appBaseUrl } from './deployment-base'
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'
import MediaLibraryView from './views/MediaLibraryView.vue'
import TestView from './views/TestView.vue'
import TestQuestionsView from './views/TestQuestionsView.vue'
import TestPreviewView from './views/TestPreviewView.vue'
import NotFoundView from './views/NotFoundView.vue'
import { NOT_FOUND_PATH, retainExplicitLanguage } from './navigation'
import { STATIC_DEMO } from './static-demo'

// The static demo has no author area: its addresses fall through to the 404 page.
const authorRoutes = STATIC_DEMO ? [] : [
  { path: '/admin', name: 'admin', component: AdminView },
  { path: '/admin/media', name: 'admin-media', component: MediaLibraryView },
  { path: '/admin/tests/:id/questions', name: 'test-questions', component: TestQuestionsView },
  { path: '/admin/tests/:id/preview', name: 'test-preview', component: TestPreviewView },
]

export const router = createRouter({
  // Honor the Vite build base so deployment is not tied to a particular domain/path.
  history: createWebHistory(appBaseUrl()),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    ...authorRoutes,
    { path: '/tests/:id', name: 'test', component: TestView },
    // Only unmatched locations reach the 404 page; keep this route last.
    { path: NOT_FOUND_PATH, name: 'not-found', component: NotFoundView },
  ],
})

// Preserve an explicit ?lang=cs|en across RouterLink navigation, without saving it.
router.beforeEach(retainExplicitLanguage)
