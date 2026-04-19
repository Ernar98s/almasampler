import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './app/App.vue';
import './shared/styles.css';

createApp(App).use(createPinia()).mount('#app');
