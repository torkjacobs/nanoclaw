#!/bin/bash
# Publish 7 Tork Chat blog posts to Dev.to and Hashnode
set -euo pipefail

cd "$(dirname "$0")/.."

# Parse specific keys from .env (don't source the whole file — it has malformed lines)
DEVTO_API_KEY=$(grep '^DEVTO_API_KEY=' .env | head -1 | cut -d= -f2-)
HASHNODE_TOKEN=$(grep '^HASHNODE_TOKEN=' .env | head -1 | cut -d= -f2-)
HASHNODE_PUBLICATION_ID=$(grep '^HASHNODE_PUBLICATION_ID=' .env | head -1 | cut -d= -f2-)
HASHNODE_PUBLICATION_ID="${HASHNODE_PUBLICATION_ID:-69a922583b896f7ad6abba4c}"

RESULTS_FILE="store/published-blog-posts.json"
mkdir -p store

# Initialize results JSON
echo '[]' > "$RESULTS_FILE"

BLOG_FILES=(
  "content/blog/tork-chat-launch.md"
  "content/blog/ai-governance-before-features.md"
  "content/blog/langraph-multi-agent-tutorial.md"
  "content/blog/ai-seatbelt-not-invincibility.md"
  "content/blog/vehicle-rental-ai-case-study.md"
  "content/blog/ai-chatbot-governance-comparison.md"
  "content/blog/ai-deployment-checklist.md"
)

# Function to extract frontmatter field
extract_field() {
  local file="$1" field="$2"
  sed -n '/^---$/,/^---$/p' "$file" | grep "^${field}:" | sed "s/^${field}:\s*[\"']*//" | sed "s/[\"']*\s*$//"
}

# Function to extract body (everything after second ---)
extract_body() {
  local file="$1"
  awk 'BEGIN{c=0} /^---$/{c++; if(c==2){found=1; next}} found{print}' "$file"
}

# Function to extract tags
extract_tags() {
  local file="$1"
  sed -n '/^---$/,/^---$/p' "$file" | grep "^tags:" | sed 's/^tags:\s*//' | tr ',' '\n' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | head -4
}

publish_count=0

for file in "${BLOG_FILES[@]}"; do
  echo ""
  echo "=========================================="
  echo "Processing: $file"
  echo "=========================================="

  TITLE=$(extract_field "$file" "title")
  DESCRIPTION=$(extract_field "$file" "description")
  CANONICAL=$(extract_field "$file" "canonical_url")
  BODY=$(extract_body "$file")

  # Get tags as JSON array
  TAGS_CSV=$(sed -n '/^---$/,/^---$/p' "$file" | grep "^tags:" | sed 's/^tags:\s*//')
  IFS=',' read -ra TAG_ARRAY <<< "$TAGS_CSV"
  TAGS_JSON="["
  first=true
  for tag in "${TAG_ARRAY[@]}"; do
    tag=$(echo "$tag" | xargs) # trim whitespace
    if [ "$first" = true ]; then
      TAGS_JSON+="\"$tag\""
      first=false
    else
      TAGS_JSON+=",\"$tag\""
    fi
  done
  TAGS_JSON+="]"

  echo "Title: $TITLE"
  echo "Tags: $TAGS_JSON"

  # ---- PUBLISH TO DEV.TO ----
  echo ""
  echo "Publishing to Dev.to..."

  # Build JSON payload using jq for proper escaping
  DEVTO_PAYLOAD=$(jq -n \
    --arg title "$TITLE" \
    --arg body "$BODY" \
    --argjson tags "$TAGS_JSON" \
    --arg canonical "$CANONICAL" \
    '{article: {title: $title, body_markdown: $body, published: true, tags: $tags, canonical_url: $canonical}}')

  DEVTO_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://dev.to/api/articles \
    -H "Content-Type: application/json" \
    -H "api-key: $DEVTO_API_KEY" \
    -d "$DEVTO_PAYLOAD")

  DEVTO_HTTP_CODE=$(echo "$DEVTO_RESPONSE" | tail -1)
  DEVTO_BODY=$(echo "$DEVTO_RESPONSE" | sed '$d')

  if [ "$DEVTO_HTTP_CODE" -ge 200 ] && [ "$DEVTO_HTTP_CODE" -lt 300 ]; then
    DEVTO_URL=$(echo "$DEVTO_BODY" | jq -r '.url // "unknown"')
    echo "Dev.to SUCCESS: $DEVTO_URL"
  else
    DEVTO_URL="FAILED"
    echo "Dev.to FAILED ($DEVTO_HTTP_CODE): $DEVTO_BODY"
  fi

  # ---- PUBLISH TO HASHNODE ----
  echo ""
  echo "Publishing to Hashnode..."

  # Build slug from filename
  SLUG=$(basename "$file" .md)

  HASHNODE_PAYLOAD=$(jq -n \
    --arg pubId "$HASHNODE_PUBLICATION_ID" \
    --arg title "$TITLE" \
    --arg body "$BODY" \
    --arg slug "$SLUG" \
    --arg canonical "$CANONICAL" \
    '{
      query: "mutation PublishPost($input: PublishPostInput!) { publishPost(input: $input) { post { id url slug } } }",
      variables: {
        input: {
          publicationId: $pubId,
          title: $title,
          contentMarkdown: $body,
          slug: $slug,
          originalArticleURL: $canonical,
          tags: []
        }
      }
    }')

  HASHNODE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://gql.hashnode.com \
    -H "Content-Type: application/json" \
    -H "Authorization: $HASHNODE_TOKEN" \
    -d "$HASHNODE_PAYLOAD")

  HASHNODE_HTTP_CODE=$(echo "$HASHNODE_RESPONSE" | tail -1)
  HASHNODE_BODY=$(echo "$HASHNODE_RESPONSE" | sed '$d')

  HASHNODE_URL=$(echo "$HASHNODE_BODY" | jq -r '.data.publishPost.post.url // "unknown"')
  HASHNODE_ERRORS=$(echo "$HASHNODE_BODY" | jq -r '.errors[0].message // empty')

  if [ -n "$HASHNODE_ERRORS" ]; then
    HASHNODE_URL="FAILED"
    echo "Hashnode FAILED: $HASHNODE_ERRORS"
  elif [ "$HASHNODE_URL" != "unknown" ] && [ "$HASHNODE_URL" != "null" ]; then
    echo "Hashnode SUCCESS: $HASHNODE_URL"
  else
    HASHNODE_URL="FAILED"
    echo "Hashnode FAILED ($HASHNODE_HTTP_CODE): $HASHNODE_BODY"
  fi

  # ---- UPDATE RESULTS ----
  CURRENT=$(cat "$RESULTS_FILE")
  echo "$CURRENT" | jq \
    --arg title "$TITLE" \
    --arg file "$file" \
    --arg devto "$DEVTO_URL" \
    --arg hashnode "$HASHNODE_URL" \
    '. + [{title: $title, file: $file, devto_url: $devto, hashnode_url: $hashnode}]' > "$RESULTS_FILE"

  publish_count=$((publish_count + 1))

  # 30-second delay between posts (except after the last one)
  if [ "$publish_count" -lt "${#BLOG_FILES[@]}" ]; then
    echo ""
    echo "Waiting 30 seconds before next post..."
    sleep 30
  fi
done

echo ""
echo "=========================================="
echo "ALL DONE - Results saved to $RESULTS_FILE"
echo "=========================================="
cat "$RESULTS_FILE" | jq .
