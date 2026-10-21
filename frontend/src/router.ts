import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'
import TestView from './views/TestView.vue'
import TestQuestionsView from './views/TestQuestionsView.vue'

export const router = createRouter({
  // Honor the Vite build base so deployment is not tied to a particular domain/path.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/admin', name: 'admin', component: AdminView },
    { path: '/admin/tests/:id/questions', name: 'test-questions', component: TestQuestionsView },
    { path: '/tests/:id', name: 'test', component: TestView },
  ],
})
