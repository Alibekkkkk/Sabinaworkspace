
  const p = new URLSearchParams(location.search);
  p.set('content', 'gaziz');
  location.replace('lesson.html?' + p.toString());

