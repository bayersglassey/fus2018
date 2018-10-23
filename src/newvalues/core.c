

#include <string.h>

#include "core.h"




void fus_core_init(fus_core_t *core){
    /* Ok */
}

void fus_core_cleanup(fus_core_t *core){
    /* Ok */
}



void fus_perror(fus_core_t *core, const char *msg){
    fprintf(stderr, "fus_perror: ");
    perror(msg);
}

void fus_exit(fus_core_t *core, int status){
    fprintf(stderr, "fus_exit: status=%i\n", status);
    exit(status);
}


void *fus_malloc(fus_core_t *core, size_t size){
    void *ptr = malloc(size);
    if(ptr == NULL){
        fus_perror(core, "fus_malloc");
        fus_exit(core, EXIT_FAILURE);
    }
    return ptr;
}

void *fus_calloc(fus_core_t *core, size_t n, size_t size){
    void *ptr = calloc(n, size);
    if(ptr == NULL){
        fus_perror(core, "fus_calloc");
        fus_exit(core, EXIT_FAILURE);
    }
    return ptr;
}

void *fus_realloc(fus_core_t *core, void *ptr, size_t size){
    void *new_ptr = realloc(ptr, size);
    if(new_ptr == NULL){
        fus_perror(core, "fus_realloc");
        fus_exit(core, EXIT_FAILURE);
    }
    return new_ptr;
}

void fus_free(fus_core_t *core, void *ptr){
    free(ptr);
}

void *fus_memset(fus_core_t *core, void *ptr, int value, size_t n){
    void *new_ptr = memset(ptr, value, n);
    if(new_ptr == NULL){
        fus_perror(core, "fus_memset");
        fus_exit(core, EXIT_FAILURE);
    }
    return new_ptr;
}

void *fus_memcpy(fus_core_t *core, void *ptr, void *srcptr, size_t n){
    void *new_ptr = memcpy(ptr, srcptr, n);
    if(new_ptr == NULL){
        fus_perror(core, "fus_memcpy");
        fus_exit(core, EXIT_FAILURE);
    }
    return new_ptr;
}

size_t fus_strlen(fus_core_t *core, const char *s){
    return strlen(s);
}

size_t fus_strnlen(fus_core_t *core, const char *s, size_t maxlen){
    size_t len = 0;
    while(len < maxlen && s[len] != '\0')len++;
    return len;
}

char *fus_strdup(fus_core_t *core, const char *s1){
    size_t s_len = fus_strlen(core, s1);
    char *s2 = fus_malloc(core, s_len + 1);
    strcpy(s2, s1);
    return s2;
}

char *fus_strndup(fus_core_t *core, const char *s1, size_t len){
    size_t s_len = fus_strnlen(core, s1, len);
    char *s2 = fus_malloc(core, s_len + 1);
    strncpy(s2, s1, len);
    s2[s_len] = '\0';
    return s2;
}

