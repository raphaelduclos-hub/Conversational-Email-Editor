const messagesContainer = document.querySelector('[class*="overflow-y-auto"]');
if (messagesContainer) {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  console.log('Scrolled to bottom');
}
