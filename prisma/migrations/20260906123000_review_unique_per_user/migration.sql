-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_movieCd_category_type_key" ON "Review"("userId", "movieCd", "category", "type");
