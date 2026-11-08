
  const p = new URLSearchParams(location.search);
  p.set('content', 'abay');
  location.replace('lesson.html?' + p.toString());

