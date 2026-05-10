package com.nicolas.service;

import com.nicolas.exception.BizException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Service
public class SkillFileService {

    private static final long MAX_BYTES = 50L * 1024 * 1024; // 50 MB

    private static final java.util.Set<String> ALLOWED_EXTENSIONS = java.util.Set.of(
        "zip", "pdf", "txt", "md", "json", "yaml", "yml", "py", "ipynb"
    );

    @Value("${skill.upload-dir:uploads/skills}")
    private String uploadDir;

    public String store(Long userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw BizException.badRequest("File is empty");
        }
        if (file.getSize() > MAX_BYTES) {
            throw BizException.badRequest("File exceeds 50 MB limit");
        }
        String original = file.getOriginalFilename();
        String ext = (original != null && original.contains("."))
            ? original.substring(original.lastIndexOf('.') + 1).toLowerCase()
            : "";
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw BizException.badRequest("File type '." + ext + "' is not allowed");
        }

        String filename = UUID.randomUUID() + "." + ext;
        Path dir = Paths.get(uploadDir).resolve(String.valueOf(userId));
        try {
            Files.createDirectories(dir);
            Files.copy(file.getInputStream(), dir.resolve(filename), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw BizException.badRequest("Failed to store file: " + e.getMessage());
        }

        return userId + "/" + filename;
    }

    /**
     * Resolve a stored skill file's relative path (from {@code skill_listings.file_path})
     * to an absolute filesystem path, with a path-traversal guard so a malicious
     * {@code "../../../etc/passwd"} value can't escape the upload directory.
     */
    public SkillFile load(String relativePath) {
        if (!StringUtils.hasText(relativePath)) {
            throw BizException.notFound("This skill has no server-hosted file");
        }
        Path base = Paths.get(uploadDir).toAbsolutePath().normalize();
        Path resolved = base.resolve(relativePath).toAbsolutePath().normalize();
        if (!resolved.startsWith(base)) {
            throw BizException.forbidden("Invalid file path");
        }
        if (!Files.isRegularFile(resolved)) {
            throw BizException.notFound("Deliverable file is missing on disk");
        }
        long size;
        try {
            size = Files.size(resolved);
        } catch (IOException e) {
            throw BizException.badRequest("Cannot stat file: " + e.getMessage());
        }
        return new SkillFile(resolved, resolved.getFileName().toString(), size);
    }

    public record SkillFile(Path path, String filename, long size) {
        public String extension() {
            int dot = filename.lastIndexOf('.');
            return dot >= 0 ? filename.substring(dot) : "";
        }
    }
}
