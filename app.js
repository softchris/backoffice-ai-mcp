const state = {
	products: [],
};

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function renderProducts() {
	const root = document.getElementById("products");
	if (!root) {
		return;
	}

	if (!state.products.length) {
		root.innerHTML = '<p class="empty">No products yet. Create your first one above.</p>';
		return;
	}

	root.innerHTML = state.products
		.slice()
		.reverse()
		.map(
			(product) => `
				<article class="product">
					<h3>${escapeHtml(product.title || "Untitled")}</h3>
					<p class="meta">Keywords: ${escapeHtml(product.keywords || "")}</p>
					<p>${escapeHtml(product.description || "")}</p>
				</article>
			`,
		)
		.join("");
}

function setStatus(message, isError = false) {
	const status = document.getElementById("status");
	if (!status) {
		return;
	}

	status.textContent = message;
	status.style.color = isError ? "#b42318" : "";
}

async function loadProducts() {
	try {
		const response = await fetch("/api/products");
		const payload = await response.json();

		if (!response.ok) {
			throw new Error(payload?.error || "Could not load products");
		}

		state.products = Array.isArray(payload.products) ? payload.products : [];
		renderProducts();
	} catch (error) {
		setStatus(`Error: ${error.message}`, true);
	}
}

function setupCreateForm() {
	const form = document.getElementById("create-product-form");
	const submitButton = document.getElementById("submit-btn");
	const titleInput = document.getElementById("title");
	const keywordsInput = document.getElementById("keywords");

	form?.addEventListener("submit", async (event) => {
		event.preventDefault();

		const title = String(titleInput?.value || "").trim();
		const keywords = String(keywordsInput?.value || "").trim();

		if (!title || !keywords) {
			setStatus("Please provide both title and keywords.", true);
			return;
		}

		if (submitButton) {
			submitButton.disabled = true;
		}

		setStatus("Generating product description via MCP sampling...");

		try {
			const response = await fetch("/api/products/generate-description", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ title, keywords }),
			});

			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || "Could not create product");
			}

			if (payload?.product) {
				state.products.push(payload.product);
			}

			renderProducts();
			setStatus("Product created.");
			form.reset();
			titleInput?.focus();
		} catch (error) {
			setStatus(`Error: ${error.message}`, true);
		} finally {
			if (submitButton) {
				submitButton.disabled = false;
			}
		}
	});
}

setupCreateForm();
await loadProducts();
