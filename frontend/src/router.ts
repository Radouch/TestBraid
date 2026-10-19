import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'
import TestView from './views/TestView.vue'

export const router = createRouter({
  // Honor the Vite build base so deployment is not tied to a particular domain/path.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/admin', name: 'admin', component: AdminView },
    { path: '/tests/:id', name: 'test', component: TestView },
  ],
})
