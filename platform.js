(function (root) {
  'use strict';
  var declared = document.documentElement.getAttribute('data-platform');
  var platform = root.xhs && root.xhs.miniTool ? 'xhs' : (declared === 'toy' || declared === 'xhs' ? declared : 'web');

  function updateViewport() {
    var viewport = root.visualViewport;
    var height = viewport && viewport.height ? viewport.height : root.innerHeight;
    document.documentElement.style.setProperty('--app-height', Math.round(height) + 'px');
  }
  updateViewport();
  root.addEventListener('resize', updateViewport);
  if (root.visualViewport && root.visualViewport.addEventListener) {
    root.visualViewport.addEventListener('resize', updateViewport);
  }
  root.VocalSudokuPlatform = {
    name: platform,
    capabilities: function () {
      var canvas = document.createElement('canvas');
      return {
        platform: platform,
        canPickImage: !!(root.File && root.URL && root.URL.createObjectURL && canvas.toBlob),
        canPickAudio: platform !== 'xhs' && !!root.File,
        canPersistBlob: !!root.indexedDB,
        canUseBuiltInAudio: !!(root.AudioContext || root.webkitAudioContext)
      };
    }
  };
}(window));
