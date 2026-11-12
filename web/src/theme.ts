// ===========================================================================
// Central Ant Design theme — the single source of truth for brand tokens.
// Applied once via <ConfigProvider theme={theme}> in App.tsx.
//
// Only the brand/surface tokens are overridden; Ant Design generates the
// interaction colours (hover/active/focus) from colorPrimary, and the semantic
// status colours (success/warning/error/info) are deliberately left as Ant's
// defaults so errors stay visually distinct from the brand red.
// ===========================================================================
import type { ThemeConfig } from 'antd'

export const BRAND_RED = '#CB0A2F'
export const APP_BG = '#F4F4F4'
export const SURFACE = '#ffffff'
export const SELECTED_BG = '#fbe9ec' // pale red — selected navigation surface

// IBM Plex Sans (self-hosted via @fontsource in main.tsx), with system fallbacks.
export const FONT_FAMILY =
  "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const HEADER_HEIGHT = 56

export const theme: ThemeConfig = {
  token: {
    colorPrimary: BRAND_RED,
    colorLink: BRAND_RED,
    colorBgLayout: APP_BG,
    borderRadius: 6,
    controlHeight: 40, // comfortable form controls
    fontSize: 14, // base body text
    fontFamily: FONT_FAMILY,
    // Subtle borders, minimal shadows.
    boxShadow:
      '0 1px 2px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)',
    boxShadowSecondary:
      '0 2px 8px rgba(0,0,0,0.08)',
  },
  components: {
    Layout: {
      headerBg: SURFACE,
      siderBg: SURFACE,
      bodyBg: APP_BG,
      headerHeight: HEADER_HEIGHT,
      headerPadding: '0 8px 0 4px',
    },
    Menu: {
      itemBg: SURFACE,
      itemSelectedBg: SELECTED_BG,
      itemSelectedColor: BRAND_RED,
      itemHeight: 40,
      iconSize: 18,
      itemBorderRadius: 6,
    },
    Card: {
      borderRadiusLG: 6,
    },
  },
}
