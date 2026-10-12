import React, { useRef, useState } from "react";

// A one- or two-photo gallery for the item details page. Photos are shown with
// object-fit: contain (see .gallery-stage img), so any shape of picture --
// landscape, portrait, square -- is fully visible and never stretched.
//
// - With one photo it is just the picture; no controls are drawn.
// - With two: previous/next buttons, a "1 / 2" counter, clickable thumbnails,
//   arrow-key navigation, and swipe on touch screens.
// - A photo whose address fails to load is dropped, so a dead link can't leave
//   a blank slide; with nothing left it falls back to `empty`.
// `children` render on top of the stage (e.g. the "Unavailable" badge).
// Pass a `key` that changes with the images so the slide index resets.
export function ImageGallery({ images = [], alt, empty, children }) {
  const [broken, setBroken] = useState([]);
  const [index, setIndex] = useState(0);
  const touchX = useRef(null);

  const urls = [...new Set(images.filter(Boolean))].filter(url => !broken.includes(url));
  const count = urls.length;
  const current = Math.min(index, Math.max(0, count - 1));
  const go = step => setIndex((current + step + count) % count);

  const onKeyDown = event => {
    if (count < 2) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
  };
  const onTouchEnd = event => {
    if (touchX.current === null || count < 2) return;
    const dx = event.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  return <div className="shop-detail-gallery">
    <div
      className="shop-detail-media gallery-stage"
      tabIndex={count > 1 ? 0 : undefined}
      role={count > 1 ? "group" : undefined}
      aria-roledescription={count > 1 ? "carousel" : undefined}
      aria-label={count > 1 ? `${alt} photos` : undefined}
      onKeyDown={onKeyDown}
      onTouchStart={event => { touchX.current = event.touches[0].clientX; }}
      onTouchEnd={onTouchEnd}
    >
      {count > 0
        ? <img
            key={urls[current]}
            src={urls[current]}
            alt={count > 1 ? `${alt} — photo ${current + 1} of ${count}` : alt}
            onError={() => setBroken(list => [...list, urls[current]])}
          />
        : empty}
      {count > 1 && <>
        <button type="button" className="gallery-arrow is-prev" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
        <button type="button" className="gallery-arrow is-next" onClick={() => go(1)} aria-label="Next photo">›</button>
        <span className="gallery-counter" aria-live="polite">{current + 1} / {count}</span>
      </>}
      {children}
    </div>

    {count > 1 && <div className="gallery-thumbs" role="tablist" aria-label="Choose a photo">
      {urls.map((url, i) => <button
        key={url}
        type="button"
        role="tab"
        aria-selected={i === current}
        aria-label={`Show photo ${i + 1}`}
        className={`gallery-thumb ${i === current ? "is-active" : ""}`}
        onClick={() => setIndex(i)}
      ><img src={url} alt="" onError={() => setBroken(list => [...list, url])} /></button>)}
    </div>}
  </div>;
}
