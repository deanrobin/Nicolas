package com.nicolas.exception;

import com.nicolas.model.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResponse<Void>> handleBizException(BizException ex) {
        return ResponseEntity.status(ex.getCode())
                .body(ApiResponse.error(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error(400, message));
    }

    /**
     * Spring throws this when an {@link org.springframework.http.converter.HttpMessageConverter}
     * fails to write the response body — e.g. FastJSON choking on a Hibernate-enhanced
     * entity. Without an explicit handler the response often ends up as 500 + empty body
     * (the converter has already started writing when it throws), which the browser
     * surfaces as the unhelpful "Unexpected end of JSON input".
     */
    @ExceptionHandler(HttpMessageNotWritableException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotWritable(HttpMessageNotWritableException ex) {
        log.error("Response serialization failed", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "Failed to serialize response"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneral(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "Internal server error"));
    }

    /**
     * Last-resort catch for {@link Throwable} (e.g. {@link Error} subclasses
     * that {@code @ExceptionHandler(Exception.class)} does not match).
     * Without this, an Error escaping a controller becomes a Tomcat-default
     * 500 with HTML or empty body.
     */
    @ExceptionHandler(Throwable.class)
    public ResponseEntity<ApiResponse<Void>> handleThrowable(Throwable ex) {
        log.error("Unhandled throwable", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(500, "Internal server error"));
    }
}
