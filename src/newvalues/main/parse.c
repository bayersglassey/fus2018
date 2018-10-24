

/* Compile with -DFUS_COLOR to see pretty colors! */
#ifdef FUS_COLOR
#include "../posix.h" /* fileno, isatty */
#endif

#include "../includes.h"
#include "../ansi.h"


#ifdef FUS_COLOR
#define IFTTY(F)
/* #define IFTTY(F) if(isatty(fileno(F)))

...isatty is cute, but I'd rather my tools not decide crap for me.
You can pass -R to less if you want it to pass raw colors along to
the terminal instead of spewing ESC[33m0 etc everywhere. */
#else
#define IFTTY(F) if(0)
#endif

static const char *fus_lexer_get_token_color(fus_lexer_t *lexer){
    fus_lexer_token_type_t type = lexer->token_type;
    static const char *colors[] = {
        ANSI_COLOR_BCYAN,    /* done */
        ANSI_COLOR_BRED,     /* error */
        ANSI_COLOR_YELLOW,   /* int */
        ANSI_COLOR_BBLUE,    /* op (sym) */
        ANSI_COLOR_GREEN,    /* str */
        ANSI_COLOR_BMAGENTA, /* arr_open */
        ANSI_COLOR_BMAGENTA, /* arr_close */
        ANSI_COLOR_CYAN      /* split */
    };
    if(type < 0 || type >= FUS_TOKENS)return ANSI_COLOR_BRED;
    if(type == FUS_TOKEN_SYM){
        char c = lexer->token[0];
        if(c == '_' || isalpha(c))return ANSI_COLOR_WHITE; /* name */
    }
    return colors[type];
}

static int parse(fus_t *fus, const char *filename, const char *text){
    fus_lexer_t *lexer = &fus->lexer;
    fus_lexer_reset(lexer, fus_strdup(&fus->core, filename));
    fus_lexer_load_chunk(lexer, text, strlen(text) + 1);

    int i = 0;
    int row = lexer->row;
    while(fus_lexer_is_ok(lexer)){
        if(lexer->row > row){
            printf("\n");
            for(int i = 0; i < lexer->indent; i++)printf(" ");
            row = lexer->row;
        }else if(i > 0)printf(" ");
        IFTTY(stdout) printf(fus_lexer_get_token_color(lexer));
        fus_lexer_print_token(lexer, stdout, false);
        IFTTY(stdout) printf(ANSI_COLOR_RESET);
        fus_lexer_next(lexer);
        i++;
    }
    printf("\n");

    return EXIT_SUCCESS;
}

int main(int n_args, char *args[]){
    if(n_args < 2){
        fprintf(stderr, "Usage: %s FILE\n", args[0]);
        fprintf(stderr, "Parses the file as fus data and prints formatted "
            "version to stdout.\n");
        return EXIT_FAILURE;
    }

    char *buffer = NULL;
    const char *filename = args[1];
    char *text = NULL;
    if(!strcmp(filename, "-")){
        filename = "<stdin>";
        /* TODO */
        //text = stdin;
        text = "TODO 123 lalaa\nasdz.";
    }else{
        buffer = load_file(filename);
        if(buffer == NULL)return EXIT_FAILURE;
        text = buffer;
    }

    fus_t fus;
    fus_init(&fus);

    int status = parse(&fus, filename, text);

    fus_cleanup(&fus);
    free(buffer);
    fprintf(stderr, "OK\n");
    return status;
}
