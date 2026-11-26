import {
  DOMAIN,
  DOMAIN_SIZE,
  GREY_700,
  HEIGHT,
  INK,
  LOGO_ASPECT,
  LOGO_HEIGHT,
  PAPER,
  SAFE_X,
  SAFE_Y,
  TEXT_SIZE,
  WIDTH,
} from "./tokens.mjs";

const h = (type, style, children) => ({ type, props: { style, children } });

// page: { text, logo: data URI }. The lockup and the page text sit centred; the domain is small at the bottom.
export function template(page) {
  const logoWidth = Math.round(LOGO_HEIGHT * LOGO_ASPECT);
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: PAPER,
      boxSizing: "border-box",
      padding: `${SAFE_Y}px ${SAFE_X}px`,
      position: "relative",
    },
    [
      {
        type: "img",
        props: {
          src: page.logo,
          height: LOGO_HEIGHT,
          width: logoWidth,
          style: { height: LOGO_HEIGHT, width: logoWidth },
        },
      },
      h(
        "div",
        {
          display: "flex",
          textAlign: "center",
          justifyContent: "center",
          marginTop: 56,
          fontFamily: "Inter",
          fontWeight: 500,
          fontSize: TEXT_SIZE,
          lineHeight: 1.2,
          color: INK,
        },
        page.text,
      ),
      h(
        "div",
        {
          display: "flex",
          position: "absolute",
          bottom: SAFE_Y,
          fontFamily: "JBMono",
          fontSize: DOMAIN_SIZE,
          color: GREY_700,
        },
        DOMAIN,
      ),
    ],
  );
}
