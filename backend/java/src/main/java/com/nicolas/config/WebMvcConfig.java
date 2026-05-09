package com.nicolas.config;

import com.alibaba.fastjson2.support.spring6.http.converter.FastJsonHttpMessageConverter;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        FastJsonHttpMessageConverter converter = new FastJsonHttpMessageConverter();

        com.alibaba.fastjson2.support.config.FastJsonConfig config =
                new com.alibaba.fastjson2.support.config.FastJsonConfig();
        config.setCharset(StandardCharsets.UTF_8);
        converter.setFastJsonConfig(config);
        converter.setSupportedMediaTypes(List.of(
                MediaType.APPLICATION_JSON,
                new MediaType("application", "*+json")
        ));

        // 插到第一位，优先于默认 Jackson；保留 Jackson + String/ByteArray/Resource
        // 等默认 converter 作为回退，避免某些类型（如 /error 的 Map 输出、文件下载）
        // 因为 FastJSON 失败而返回空 body。
        converters.add(0, converter);
    }
}
