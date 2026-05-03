package com.nicolas.config;

import com.alibaba.fastjson2.support.config.FastJsonConfig;
import com.alibaba.fastjson2.support.spring6.http.converter.FastJsonHttpMessageConverter;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Configuration
public class FastJsonConfig implements WebMvcConfigurer {

    @Override
    public void configureMessageConverters(List<HttpMessageConverter<?>> converters) {
        FastJsonHttpMessageConverter converter = new FastJsonHttpMessageConverter();

        com.alibaba.fastjson2.support.config.FastJsonConfig config =
                new com.alibaba.fastjson2.support.config.FastJsonConfig();
        config.setCharset(StandardCharsets.UTF_8);
        converter.setFastJsonConfig(config);
        converter.setSupportedMediaTypes(List.of(MediaType.APPLICATION_JSON));

        // 插到第一位，优先于 Jackson
        converters.add(0, converter);
    }
}
