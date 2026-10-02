document.addEventListener('DOMContentLoaded', function () {
    try {
        // initEyeNavPanel throws if this surface is missing a required
        // element - caught here so a missing/renamed id produces a visible
        // console error instead of a bare uncaught exception that also
        // skips the playButton.focus() below.
        initEyeNavPanel('eye_voice');
    } catch (error) {
        console.error('Error initializing side panel:', error);
        return;
    }

    const playButton = document.getElementById('play-button');
    playButton.focus();
});
