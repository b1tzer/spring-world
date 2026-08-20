import DefaultTheme from 'vitepress/theme'
import SvgDiagram from './components/SvgDiagram.vue'
import Layout from './Layout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('SvgDiagram', SvgDiagram)
  }
}
