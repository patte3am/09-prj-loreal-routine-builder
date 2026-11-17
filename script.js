const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const searchInput = document.getElementById("searchInput");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const showMoreWrap = document.getElementById("showMoreWrap");

const WORKER_URL = (window.LOREAL_WORKER_URL || "").trim();

const state = {
  allProducts: [],
  selectedCategory: "all",
  searchTerm: "",
  visibleCount: 6,
  selectedProductIds: new Set(),
  filteredProducts: [],
  conversationMessages: [
    {
      role: "system",
      content:
        "You are a professional and friendly L'Oréal beauty and routine advisor. Help the user understand their selected products, build personalized routines, explain product order and timing, and answer follow-up questions using only the actual product details provided. Do not invent ingredients, claims, prices, or medical diagnoses. Highlight any limitations when product information is missing.",
    },
  ],
};

function formatCategoryLabel(category) {
  if (!category) {
    return "General";
  }

  return category
    .split(" ")
    .map((word) => {
      if (word === "and") {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function truncateText(text, maxLength) {
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function getSelectedProducts() {
  return state.allProducts.filter((product) => state.selectedProductIds.has(product.id));
}

function filterProducts() {
  const searchValue = state.searchTerm.trim().toLowerCase();

  const filtered = state.allProducts.filter((product) => {
    const matchesCategory =
      state.selectedCategory === "all" || product.category === state.selectedCategory;
    const matchesSearch =
      !searchValue ||
      `${product.brand} ${product.name} ${product.description}`
        .toLowerCase()
        .includes(searchValue);

    return matchesCategory && matchesSearch;
  });

  state.filteredProducts = filtered;
  return filtered;
}

function renderCategoryOptions() {
  const categories = [...new Set(state.allProducts.map((product) => product.category))].filter(
    Boolean
  );

  categoryFilter.innerHTML = '<option value="all">All Categories</option>';

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = formatCategoryLabel(category);
    categoryFilter.appendChild(option);
  });

  categoryFilter.value = state.selectedCategory;
}

function renderProducts() {
  const filteredProducts = filterProducts();

  if (!filteredProducts.length) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products found. Try another search.
      </div>
    `;
    showMoreWrap.innerHTML = "";
    return;
  }

  const visibleProducts = filteredProducts.slice(0, state.visibleCount);

  productsContainer.innerHTML = "";

  visibleProducts.forEach((product) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `product-card ${state.selectedProductIds.has(product.id) ? "selected" : ""}`;
    card.dataset.productId = String(product.id);
    card.setAttribute("aria-pressed", String(state.selectedProductIds.has(product.id)));

    const indicator = document.createElement("span");
    indicator.className = "selection-indicator";
    indicator.setAttribute("aria-hidden", "true");
    indicator.innerHTML = '<i class="fa-solid fa-check"></i>';

    const image = document.createElement("img");
    image.src = product.image || "";
    image.alt = product.name || "Product image";
    image.loading = "lazy";

    const info = document.createElement("div");
    info.className = "product-info";

    const brand = document.createElement("span");
    brand.className = "product-brand";
    brand.textContent = product.brand || "Brand";

    const name = document.createElement("h3");
    name.className = "product-name";
    name.textContent = product.name || "Product name";

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent = truncateText(product.description || "", 100);

    info.append(brand, name, description);
    card.append(indicator, image, info);
    productsContainer.appendChild(card);
  });

  if (filteredProducts.length > state.visibleCount) {
    const showMoreBtn = document.createElement("button");
    showMoreBtn.type = "button";
    showMoreBtn.className = "show-more-btn";
    showMoreBtn.textContent = "Show More Products";
    showMoreBtn.addEventListener("click", () => {
      state.visibleCount += 6;
      renderProducts();
    });
    showMoreWrap.innerHTML = "";
    showMoreWrap.appendChild(showMoreBtn);
  } else {
    showMoreWrap.innerHTML = "";
  }
}

function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();
  selectedCount.textContent = `${selectedProducts.length} selected`;

  if (!selectedProducts.length) {
    selectedProductsList.innerHTML = `
      <p class="empty-selected">No products selected yet. Choose products above to build your routine.</p>
    `;
    const existingClearButton = document.querySelector(".clear-all-btn");
    if (existingClearButton) {
      existingClearButton.remove();
    }
    return;
  }

  const clearAllButton = document.querySelector(".clear-all-btn");
  if (clearAllButton) {
    clearAllButton.remove();
  }

  selectedProductsList.innerHTML = "";

  selectedProducts.forEach((product) => {
    const item = document.createElement("div");
    item.className = "selected-item";

    const image = document.createElement("img");
    image.src = product.image || "";
    image.alt = product.name || "Product image";
    image.className = "selected-item-image";

    const details = document.createElement("div");
    details.className = "selected-item-details";

    const brand = document.createElement("span");
    brand.className = "selected-item-brand";
    brand.textContent = product.brand || "Brand";

    const name = document.createElement("span");
    name.className = "selected-item-name";
    name.textContent = product.name || "Product name";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-selected-btn";
    removeButton.textContent = "Remove";
    removeButton.dataset.removeId = String(product.id);

    details.append(brand, name);
    item.append(image, details, removeButton);
    selectedProductsList.appendChild(item);
  });

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "clear-all-btn";
  clearButton.textContent = "Clear All";
  clearButton.addEventListener("click", () => {
    state.selectedProductIds.clear();
    renderSelectedProducts();
    renderProducts();
  });

  selectedProductsList.parentElement.appendChild(clearButton);
}

function renderConversation() {
  chatWindow.innerHTML = "";

  const visibleMessages = state.conversationMessages.filter((message) => message.role !== "system");

  if (!visibleMessages.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "chat-empty";
    emptyState.textContent = "Select products and generate a routine to begin your chat.";
    chatWindow.appendChild(emptyState);
    return;
  }

  visibleMessages.forEach((message) => {
    const row = document.createElement("div");
    row.className = `chat-row ${message.role === "user" ? "user-row" : "assistant-row"}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    if (message.role === "assistant") {
      renderFormattedMessage(bubble, message.content);
    } else {
      bubble.textContent = message.content;
    }

    row.appendChild(bubble);
    chatWindow.appendChild(row);
  });

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function addInlineText(parent, text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  parts.forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
      return;
    }

    parent.appendChild(document.createTextNode(part));
  });
}

function renderFormattedMessage(container, content) {
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      const headingElement = document.createElement("h3");
      addInlineText(headingElement, heading[1]);
      container.appendChild(headingElement);
      index += 1;
      continue;
    }

    const listMatch = line.match(/^(?:[-*]\s+|\d+[.)]\s+)/);
    if (listMatch) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const list = document.createElement(ordered ? "ol" : "ul");

      while (index < lines.length) {
        const itemLine = lines[index].trim();
        const itemMatch = itemLine.match(/^(?:[-*]\s+|\d+[.)]\s+)/);
        if (!itemMatch || /^\d+[.)]\s+/.test(itemLine) !== ordered) {
          break;
        }

        const item = document.createElement("li");
        addInlineText(item, itemLine.slice(itemMatch[0].length));
        list.appendChild(item);
        index += 1;
      }

      container.appendChild(list);
      continue;
    }

    const paragraph = document.createElement("p");
    addInlineText(paragraph, line.replace(/^---+$/, ""));
    container.appendChild(paragraph);
    index += 1;
  }
}

function clearConversation() {
  const systemMessage = state.conversationMessages.find((message) => message.role === "system");
  state.conversationMessages = systemMessage ? [systemMessage] : [];
  renderConversation();
}

function appendChatStatus(message, isError = false) {
  const status = document.createElement("div");
  status.className = isError ? "chat-error" : "chat-status";
  status.textContent = message;
  chatWindow.appendChild(status);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function getSelectedProductsSummary() {
  return getSelectedProducts()
    .map(
      (product) =>
        `- ${product.brand}: ${product.name} (${product.category}) — ${product.description || "No description available."}`
    )
    .join("\n");
}

function buildRoutinePrompt() {
  return `Build a personalized, professional L'Oréal beauty routine using the selected products below. Explain the product order, morning or evening use when relevant, why each product belongs in the routine, general usage guidance, important precautions, and how the products fit together as a complete routine. Keep the answer practical and easy to follow. Use only the real product information provided. If any product information is missing, say so clearly.\n\nSelected products:\n${getSelectedProductsSummary()}`;
}

async function sendRequestToWorker(messages) {
  if (!WORKER_URL) {
    throw new Error(
      "The AI routine service is not configured. Set window.LOREAL_WORKER_URL to your Cloudflare Worker endpoint before generating a routine."
    );
  }

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The AI service returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}.`);
  }

  const content = data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("The AI service did not return a valid routine response.");
  }

  return content;
}

function toggleProductSelection(productId) {
  if (state.selectedProductIds.has(productId)) {
    state.selectedProductIds.delete(productId);
  } else {
    state.selectedProductIds.add(productId);
  }

  renderSelectedProducts();
  renderProducts();
}

async function generateRoutine() {
  const selectedProducts = getSelectedProducts();

  if (!selectedProducts.length) {
    appendChatStatus("Please select at least one product before generating a routine.", true);
    return;
  }

  const prompt = buildRoutinePrompt();
  state.conversationMessages.push({ role: "user", content: prompt });
  renderConversation();
  appendChatStatus("Generating your routine...");
  generateRoutineBtn.disabled = true;

  try {
    const reply = await sendRequestToWorker(state.conversationMessages);
    state.conversationMessages.push({ role: "assistant", content: reply });
    renderConversation();
  } catch (error) {
    appendChatStatus(
      error?.message || "Something went wrong while generating your routine. Please try again.",
      true
    );
  } finally {
    generateRoutineBtn.disabled = false;
  }
}

async function sendFollowUpQuestion(text) {
  const trimmedMessage = text.trim();

  if (!trimmedMessage) {
    appendChatStatus("Please enter a question before sending.", true);
    return;
  }

  state.conversationMessages.push({ role: "user", content: trimmedMessage });
  renderConversation();
  appendChatStatus("Thinking...");

  try {
    const reply = await sendRequestToWorker(state.conversationMessages);
    state.conversationMessages.push({ role: "assistant", content: reply });
    renderConversation();
  } catch (error) {
    appendChatStatus(
      error?.message || "The assistant could not answer that question. Please try again.",
      true
    );
  }
}

async function loadProducts() {
  try {
    const response = await fetch("./products.json");
    const data = await response.json();
    const products = Array.isArray(data.products) ? data.products : [];

    if (!products.length) {
      throw new Error("No products were found in the catalog.");
    }

    state.allProducts = products;
    renderCategoryOptions();
    renderProducts();
    renderSelectedProducts();
  } catch (error) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Unable to load product catalog. Please refresh the page and try again.
      </div>
    `;
    showMoreWrap.innerHTML = "";
    console.error("Product loading failed:", error);
  }
}

searchInput.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  state.visibleCount = 6;
  renderProducts();
});

categoryFilter.addEventListener("change", (event) => {
  state.selectedCategory = event.target.value;
  state.visibleCount = 6;
  renderProducts();
});

productsContainer.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");
  if (!removeButton) {
    return;
  }

  const id = Number(removeButton.dataset.removeId);
  state.selectedProductIds.delete(id);
  renderSelectedProducts();
  renderProducts();
});

generateRoutineBtn.addEventListener("click", generateRoutine);
document.getElementById("clearConversation").addEventListener("click", clearConversation);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = userInput.value.trim();

  if (!value) {
    appendChatStatus("Please enter a question before sending.", true);
    return;
  }

  userInput.value = "";
  await sendFollowUpQuestion(value);
});

renderConversation();
loadProducts();
